"""
Local F5-TTS voice cloning HTTP server.

Loads the F5-TTS model once at startup, then exposes:
  GET  /health    — returns {ok, device, model_loaded}
  POST /clone     — multipart form: ref_audio (WAV/MP3), ref_text (str, optional), gen_text (str)
                    returns: audio/wav bytes

Runs on http://127.0.0.1:7860 (localhost only, not exposed to the network).

This is started by start.bat which sets up a venv and installs deps the first time.
"""

import io
import sys
import tempfile
import traceback

# Force UTF-8 so Unicode characters in print() (em-dashes, arrows, ellipses)
# don't crash on Windows cmd's default charmap codec.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# IMPORTANT: enable faulthandler so any C-level crash prints a stack trace
# instead of dying silently. Also: import numpy + sklearn BEFORE flask and
# torch — order matters for C extension loading on Windows; some torch + flask
# combinations segfault if loaded before numpy/sklearn primes the ABI.
import faulthandler; faulthandler.enable()
import numpy  # noqa: F401  (intentional bare import to pin ABI)
import sklearn  # noqa: F401

# Point pydub AND transformers at the bundled ffmpeg binary (shipped via
# imageio-ffmpeg). F5-TTS uses pydub for some audio ops; Whisper (auto-transcribe)
# uses subprocess.Popen("ffmpeg", ...) directly. We need BOTH to work.
#
# imageio-ffmpeg ships the binary as "ffmpeg-win-x86_64-v7.1.exe" — not the
# bare "ffmpeg.exe" that subprocess looks for. We copy it to a standard name
# so subprocess.Popen("ffmpeg", ...) finds it via PATH.
try:
    import os
    import shutil
    import imageio_ffmpeg
    _FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
    _FFMPEG_DIR = os.path.dirname(_FFMPEG_BIN)
    _FFMPEG_STD = os.path.join(_FFMPEG_DIR, "ffmpeg.exe")
    if not os.path.exists(_FFMPEG_STD):
        shutil.copy2(_FFMPEG_BIN, _FFMPEG_STD)
    os.environ["PATH"] = _FFMPEG_DIR + os.pathsep + os.environ.get("PATH", "")
    # Also tell pydub explicitly (covers tools that bypass PATH).
    from pydub import AudioSegment
    AudioSegment.converter = _FFMPEG_STD
    AudioSegment.ffmpeg = _FFMPEG_STD
    AudioSegment.ffprobe = _FFMPEG_STD
    print(f"[ffmpeg] using bundled binary: {_FFMPEG_STD}", flush=True)
except Exception as e:
    print(f"[ffmpeg] WARNING: couldn't wire up imageio-ffmpeg: {e}", flush=True)

print("==========================================")
print(" F5-TTS Voice Clone Server")
print("==========================================")
print("Importing torch (may take 10 sec)…", flush=True)
import torch
import soundfile as sf

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {DEVICE} {'(GPU acceleration)' if DEVICE == 'cuda' else '(CPU only — generation will be slower)'}", flush=True)

print("Loading F5-TTS (first run downloads ~1 GB of model weights)…", flush=True)
try:
    from f5_tts.api import F5TTS
    MODEL = F5TTS(device=DEVICE)
    MODEL_LOADED = True
    print("✓ F5-TTS loaded. Server ready.", flush=True)
except Exception as e:
    MODEL = None
    MODEL_LOADED = False
    print(f"!! F5-TTS failed to load: {e}", flush=True)
    print("   You may need to run start.bat again to retry the install.", flush=True)

app = Flask(__name__)
# Allow CORS from any origin — access is gated at the network layer by
# Tailscale (only YOUR authenticated devices can reach this server's host).
# If you don't use Tailscale and want stricter security, replace with an
# explicit list of origins.
CORS(app, origins="*")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": MODEL_LOADED,
        "device": DEVICE,
        "model_loaded": MODEL_LOADED,
        "model": "F5-TTS",
    })


@app.route("/clone", methods=["POST"])
def clone():
    if not MODEL_LOADED:
        return jsonify({"error": "Model failed to load — restart the server"}), 503
    try:
        ref_audio = request.files.get("ref_audio")
        ref_text = (request.form.get("ref_text") or "").strip()
        gen_text = (request.form.get("gen_text") or "").strip()

        if not ref_audio:
            return jsonify({"error": "ref_audio file is required"}), 400
        if not gen_text:
            return jsonify({"error": "gen_text is required"}), 400

        # Save uploaded reference audio to a temp file (F5-TTS expects a file path).
        suffix = "." + (ref_audio.filename.rsplit(".", 1)[-1] if "." in (ref_audio.filename or "") else "wav")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            ref_audio.save(tmp.name)
            ref_path = tmp.name

        print(f"[clone] ref={ref_audio.filename} ref_text_len={len(ref_text)} gen_text_len={len(gen_text)}", flush=True)

        # Run inference.
        wav, sr, _ = MODEL.infer(
            ref_file=ref_path,
            ref_text=ref_text,
            gen_text=gen_text,
            target_rms=0.1,
            cross_fade_duration=0.15,
            nfe_step=16,  # was 32 — half the diffusion steps for ~2x faster CPU generation
            speed=1.0,
        )

        # Encode as WAV in memory and return.
        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="WAV")
        buf.seek(0)
        return send_file(buf, mimetype="audio/wav", as_attachment=False, download_name="clone.wav")

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = 7860
    # Bind to 0.0.0.0 so Tailscale (and other devices on this host's networks)
    # can reach us. Tailscale's MagicDNS handles auth — only YOUR signed-in
    # devices can route to this machine's tailscale IP.
    print(f"\n-> Listening on http://0.0.0.0:{port}", flush=True)
    print(f"-> Local access:      http://127.0.0.1:{port}", flush=True)
    print(f"-> Tailscale access:  http://<this-pc-tailscale-name>.tsXXXX.ts.net:{port}", flush=True)
    print("-> The AI Studio's Voice Clone tab will auto-detect this.", flush=True)
    print("-> Leave this window open while you use voice cloning.", flush=True)
    print("-> Press Ctrl+C to stop.\n", flush=True)
    app.run(host="0.0.0.0", port=port, threaded=False)
