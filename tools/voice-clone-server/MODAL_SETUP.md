# Modal Cloud Setup — Free GPU-hosted Voice Cloning

After this is set up, voice cloning works from any PC (laptop, desktop, phone) in ~5-10 seconds per generation. No more local server, no more "still cloning" waits, no more $5/mo ElevenLabs. **Free** via Modal.com's $30/mo GPU credit.

## What you do (browser)

### 1. Sign up at Modal (~2 min, no card required)

1. Go to https://modal.com/signup
2. Sign in with **GitHub** or **Google** — same email you use for everything else
3. You're in. No credit card, no questions. Free $30/mo GPU credit starts immediately.

### 2. Authorize the CLI (~30 sec)

The CLI on your laptop needs a token so it can deploy on your behalf.

In a fresh PowerShell or Command Prompt:
```
cd C:\Users\miskr\Documents\my-re-hub\tools\voice-clone-server
venv\Scripts\python.exe -m modal token new
```

That opens a browser tab → click "Authorize" → it auto-fills the token back to the CLI. Done.

## What Claude does (terminal)

After the two browser steps above, tell me you're done and I'll run:

```
venv\Scripts\python.exe -m modal deploy modal_deploy.py
```

That builds the GPU container (downloads F5-TTS + Whisper-tiny inside the container, ~5 min one-time), deploys it, and prints two URLs:

```
✓ Created web function clone => https://YOURNAME--f5-tts-clone-clone.modal.run
✓ Created web function health => https://YOURNAME--f5-tts-clone-health.modal.run
```

I'll grab those URLs, paste them into the AI Studio settings (in your browser's localStorage), and the Voice Clone tab will start using them automatically.

## Daily use

- Nothing. The Modal function auto-scales to zero when idle ($0).
- When you click Generate, Modal spins up a T4 GPU container (~5-10 sec cold start the first time, ~1 sec after that within 2 min), generates audio in ~5 sec, returns it.
- Total typical cost per clone: ~$0.001 of your $30 free monthly credit. You can do ~5000 clones/month for free.

## What if the $30 free credit runs out?

You can pay-as-you-go at Modal (~$0.59/hr T4 GPU only while a request is processing) — basically pennies a month for personal use. Or just wait for the credit to refresh next month. Modal doesn't auto-charge a card you haven't entered.

## Troubleshooting

- **"modal: command not found"** — use `venv\Scripts\python.exe -m modal` instead of plain `modal`
- **Deploy fails with "Build failed"** — usually a dependency conflict. Tell Claude the exact error.
- **AI Studio still shows offline** — make sure you pasted the URL ending in `.modal.run`, not just `modal.run`. And without a trailing path.
