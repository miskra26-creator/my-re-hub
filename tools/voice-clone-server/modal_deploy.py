"""
F5-TTS voice cloning, deployed to Modal.com on a T4 GPU.

Single FastAPI app mounted via @modal.asgi_app — exposes /health and /clone
on one URL with proper CORS handling. Accepts multipart form data so the
React client uses the same payload shape for both local server and cloud.

Deploy:
  cd C:\\Users\\miskr\\Documents\\my-re-hub\\tools\\voice-clone-server
  PYTHONIOENCODING=utf-8 venv/Scripts/python.exe -m modal deploy modal_deploy.py
"""

import modal

app = modal.App("f5-tts-clone")

# Container image — same pinned versions that worked on the laptop CPU.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.5.1",
        "torchaudio==2.5.1",
        "transformers==4.46.3",
        "numpy<2",
        "scikit-learn<1.6",
        "f5-tts",
        "soundfile",
        "fastapi",
        "python-multipart",
    )
)


def _preload_models():
    """Bake Whisper-tiny + F5-TTS weights into the image so cold-starts are fast."""
    # Patch F5-TTS to use Whisper-tiny instead of the slow whisper-large-v3-turbo
    import f5_tts.infer.utils_infer as _u
    with open(_u.__file__, "r", encoding="utf-8") as f:
        src = f.read()
    src = src.replace(
        'model="openai/whisper-large-v3-turbo"',
        'model="openai/whisper-tiny.en"',
    )
    with open(_u.__file__, "w", encoding="utf-8") as f:
        f.write(src)
    # Trigger model downloads now (build time, not request time)
    from f5_tts.api import F5TTS
    _ = F5TTS(device="cpu")
    from transformers import pipeline
    _ = pipeline("automatic-speech-recognition", model="openai/whisper-tiny.en")


image = image.run_function(_preload_models)


@app.function(
    image=image,
    gpu="T4",
    timeout=300,
    scaledown_window=120,
)
@modal.asgi_app(label="api")
def web():
    """Single FastAPI app with /health and /clone, proper CORS."""
    from fastapi import FastAPI, File, Form, UploadFile, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response
    import base64, io, tempfile

    fast_app = FastAPI()
    fast_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _model_holder = {"m": None}

    def get_model():
        if _model_holder["m"] is None:
            from f5_tts.api import F5TTS
            _model_holder["m"] = F5TTS(device="cuda")
        return _model_holder["m"]

    @fast_app.get("/health")
    def health():
        return {
            "ok": True,
            "device": "cuda",
            "model": "F5-TTS (Modal GPU)",
            "model_loaded": _model_holder["m"] is not None,
        }

    @fast_app.post("/clone")
    async def clone(
        ref_audio: UploadFile = File(...),
        ref_text: str = Form(""),
        gen_text: str = Form(...),
    ):
        if not gen_text.strip():
            raise HTTPException(400, "gen_text is required")

        # Save uploaded ref audio to a temp file (F5-TTS wants a file path).
        audio_bytes = await ref_audio.read()
        suffix = ".wav"
        if ref_audio.filename and "." in ref_audio.filename:
            suffix = "." + ref_audio.filename.rsplit(".", 1)[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            ref_path = tmp.name

        model = get_model()
        import soundfile as sf
        wav, sr, _ = model.infer(
            ref_file=ref_path,
            ref_text=ref_text.strip(),
            gen_text=gen_text.strip(),
            target_rms=0.1,
            cross_fade_duration=0.15,
            nfe_step=32,
            speed=1.0,
        )

        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="WAV")
        return Response(content=buf.getvalue(), media_type="audio/wav")

    return fast_app
