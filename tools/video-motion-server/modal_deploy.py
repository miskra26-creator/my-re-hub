"""
LTX-Video image-to-video service, deployed to Modal.com on an L4 GPU.

Open-source AI video generation by Lightricks (https://github.com/Lightricks/LTX-Video).
Takes a still photo + motion prompt, returns a short video clip with cinematic
camera motion (push-ins, pans, parallax). This is what powers AutoReel's real
"AI walkthrough" feel — no more Ken Burns slideshow.

License: open-source RAIL-style with commercial use allowed. Check Lightricks
repo for current terms.

Endpoints (single FastAPI app):
  GET  /health   -> {ok, model, device}
  POST /generate -> multipart: image (file) + prompt (text) + optional params
                    returns: video/mp4 bytes (4-sec clip by default)

Deploy (single command, run once from her machine — same pattern as F5-TTS):
  cd C:\\Users\\miskr\\Documents\\my-re-hub\\tools\\video-motion-server
  PYTHONIOENCODING=utf-8 venv/Scripts/python.exe -m modal deploy modal_deploy.py

After deploy, Modal prints the URL — typically: https://miskra26--ltx-motion-api.modal.run
That URL gets saved to localStorage so AutoReel can find it.

Cost on her account (L4 GPU at ~$0.74/hour):
  - ~10-20 sec compute per 4-sec clip
  - ~$0.002-0.004 per clip
  - ~8 clips per reel × 15 reels/month ≈ $0.30-0.50/month
  - Modal's $30 signup credit covers years at this volume
"""

import modal

app = modal.App("ltx-video-motion")

# Container image — pinned versions known to work with LTX-Video 0.9.7+
# diffusers 0.34+ includes LTXImageToVideoPipeline natively.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "diffusers==0.34.0",
        "transformers==4.51.3",
        "torch==2.5.1",
        "torchvision==0.20.1",
        "accelerate==1.0.1",
        "sentencepiece",
        "imageio[ffmpeg]",
        "pillow",
        "fastapi",
        "python-multipart",
        "huggingface_hub",
    )
)

# Persistent volume so the ~15GB LTX-Video weights only download once.
# Same pattern her F5-TTS uses for Whisper-tiny model caching.
MODEL_CACHE = "/cache"
model_volume = modal.Volume.from_name("ltx-video-cache", create_if_missing=True)


def _preload_models():
    """Pre-download LTX-Video weights into the image so cold starts are fast.

    Without this, the first request after a scale-down would download ~15GB
    of model weights, taking 2-5 minutes.
    """
    import os
    os.environ["HF_HOME"] = MODEL_CACHE
    from huggingface_hub import snapshot_download
    snapshot_download(
        repo_id="Lightricks/LTX-Video",
        cache_dir=MODEL_CACHE,
        # 0.9.7 is the latest stable as of mid-2026. Pin to avoid surprise
        # breakage when Lightricks ships LTX-2.
        revision="main",
    )


# Note: we don't run _preload_models in the image build because the snapshot
# is huge — better to download once to the volume on first cold start.


@app.function(
    image=image,
    gpu="L4",
    timeout=600,
    scaledown_window=300,  # 5 min idle before tearing down — fewer cold starts
    volumes={MODEL_CACHE: model_volume},
)
@modal.asgi_app(label="ltx-motion-api")
def web():
    """Single FastAPI app with /health and /generate. CORS open for browser calls."""
    import os
    os.environ["HF_HOME"] = MODEL_CACHE

    from fastapi import FastAPI, File, Form, UploadFile, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response
    import io, tempfile

    fast_app = FastAPI()
    fast_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Lazy-load: pipeline construction is heavy (~30-60 sec on cold start).
    # Cache it on the function container so subsequent calls reuse the warm pipe.
    _pipe_holder = {"p": None}

    def get_pipe():
        if _pipe_holder["p"] is None:
            import torch
            from diffusers import LTXImageToVideoPipeline
            pipe = LTXImageToVideoPipeline.from_pretrained(
                "Lightricks/LTX-Video",
                torch_dtype=torch.bfloat16,
                cache_dir=MODEL_CACHE,
            )
            pipe.to("cuda")
            # Enable VAE slicing to fit comfortably on L4's 24GB
            pipe.vae.enable_slicing()
            pipe.vae.enable_tiling()
            _pipe_holder["p"] = pipe
        return _pipe_holder["p"]

    @fast_app.get("/health")
    def health():
        return {
            "ok": True,
            "device": "cuda",
            "model": "LTX-Video (Modal L4)",
            "model_loaded": _pipe_holder["p"] is not None,
        }

    @fast_app.post("/generate")
    async def generate(
        image: UploadFile = File(...),
        prompt: str = Form(...),
        negative_prompt: str = Form(
            "worst quality, blurry, distorted, low resolution, text overlay, watermark, "
            "deformed objects, warping furniture"
        ),
        width: int = Form(704),
        height: int = Form(480),
        num_frames: int = Form(97),       # ~4 sec at 24 fps
        num_inference_steps: int = Form(40),
        guidance_scale: float = Form(3.0),
        seed: int = Form(-1),
    ):
        """
        Generate a video clip from a still image + motion prompt.

        Defaults: 704×480 @ 24fps × 4 seconds. That's the LTX-Video sweet spot
        for L4 GPU — runs in ~10-15 sec per clip. We upscale on the client
        side (Canvas / FFmpeg) for the final reel.

        Returns: raw mp4 bytes (video/mp4).
        """
        if not prompt.strip():
            raise HTTPException(400, "prompt is required")

        from PIL import Image as PILImage
        import torch, imageio

        # Decode upload
        img_bytes = await image.read()
        try:
            pil_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            raise HTTPException(400, f"Could not read image: {e}")

        # Resize so it matches the requested generation dims while preserving
        # the input's aspect via center crop (cheap, predictable)
        target_ratio = width / height
        in_w, in_h = pil_img.size
        in_ratio = in_w / in_h
        if in_ratio > target_ratio:
            # Wider than target — crop horizontally
            new_w = int(in_h * target_ratio)
            x0 = (in_w - new_w) // 2
            pil_img = pil_img.crop((x0, 0, x0 + new_w, in_h))
        elif in_ratio < target_ratio:
            # Taller than target — crop vertically
            new_h = int(in_w / target_ratio)
            y0 = (in_h - new_h) // 2
            pil_img = pil_img.crop((0, y0, in_w, y0 + new_h))
        pil_img = pil_img.resize((width, height), PILImage.LANCZOS)

        # Inference
        pipe = get_pipe()
        generator = torch.Generator(device="cuda")
        if seed >= 0:
            generator.manual_seed(seed)

        with torch.inference_mode():
            output = pipe(
                image=pil_img,
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_frames=num_frames,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                generator=generator,
            )
        frames = output.frames[0]  # list of PIL images

        # Encode to mp4 in-memory via imageio (ffmpeg backend)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            imageio.mimsave(
                tmp_path,
                [pil_to_np(f) for f in frames],
                fps=24,
                codec="libx264",
                quality=8,        # 0-10, 8 = high quality
                macro_block_size=1,
            )
            with open(tmp_path, "rb") as f:
                mp4_bytes = f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

        return Response(content=mp4_bytes, media_type="video/mp4")

    return fast_app


def pil_to_np(img):
    """PIL image → numpy array (H,W,3 uint8) for imageio."""
    import numpy as np
    return np.array(img, dtype="uint8")
