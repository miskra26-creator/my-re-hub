# LTX-Video motion server — deploy to Monica's Modal account

Powers AutoReel's "real AI camera motion" pipeline. Replaces the Ken Burns
canvas slideshow with actual image-to-video generation using
[Lightricks LTX-Video](https://github.com/Lightricks/LTX-Video).

## One-time deploy (single command)

You'll need Modal's CLI installed and authenticated. If you set up F5-TTS,
you already have this — same flow.

```powershell
cd C:\Users\miskr\Documents\my-re-hub\tools\video-motion-server

# Use the same venv as F5-TTS (Modal CLI lives there)
..\voice-clone-server\venv\Scripts\python.exe -m modal deploy modal_deploy.py
```

You'll see output like:

```
✓ Created objects.
├── 🔨 Created image (...)
├── 🔨 Created mount (...)
└── 🔨 Created web function => https://miskra26--ltx-motion-api.modal.run
✓ App deployed in 12.4s!
```

**Copy that `https://...modal.run` URL** — you'll paste it into AutoReel's
settings the first time you generate a reel.

## Cost on your Modal account

- L4 GPU at ~$0.74/hour
- 10-20 sec compute per 4-second clip
- ~$0.002-0.004 per clip
- 8 clips per reel × 15 reels/month ≈ **$0.30-0.50/month**
- Modal's free signup credit covers years at this volume

## Cold starts

First request after ~5 min of idle = ~30 sec wait (loading LTX-Video weights).
After that, generations are fast. AutoReel pre-warms the server before
sending the batch, so you only pay the cold-start tax once per reel.

## Testing the endpoint manually

```bash
curl -X POST https://miskra26--ltx-motion-api.modal.run/generate \
  -F "image=@your_room_photo.jpg" \
  -F "prompt=Slow cinematic push-in revealing the kitchen, real estate listing quality, 4 seconds" \
  -F "num_frames=97" \
  -o output.mp4
```

## How AutoReel uses it

1. Photo curation (Gemini Vision) picks the best 8 photos + tags each by room type
2. For each photo, AutoReel sends image + room-specific motion prompt to your Modal endpoint
3. Modal returns a 4-second mp4 clip
4. FFmpeg-wasm (in your browser) stitches the clips + adds your music, narration, captions, intro/outro cards
5. Final mp4 ready in ~60-90 seconds for an 8-clip reel
