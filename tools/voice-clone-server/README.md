# Local Voice Clone Server

Runs F5-TTS (open-source, Apache 2.0) on your own computer so voice cloning works **reliably, offline, with zero ongoing cost**. Replaces the flaky Hugging Face Space.

**Multi-PC setup:** install F5-TTS on **one** main PC (typically the desktop that stays on). Install **Tailscale** on every other PC you use. Your laptop reaches the desktop's voice server as if it were on the same network — free, secure, no port forwarding. Tailscale setup is in the "Multi-PC access" section below.

## One-time setup (~10 minutes)

### Step 1 — Install Python 3.11

If you don't already have Python:

1. Download from https://www.python.org/downloads/
2. **CRITICAL:** during install, check the box that says **"Add Python to PATH"**. Without this, nothing else works.
3. Click "Install Now", let it finish.

To verify it worked: open a fresh Command Prompt (Win+R, type `cmd`) and run:
```
python --version
```
You should see something like `Python 3.11.7`. If you get "command not found", Python wasn't added to PATH — uninstall and reinstall with that box checked.

### Step 2 — Start the server

Just double-click **`start.bat`** in this folder.

The first time you run it:
- It creates a Python venv (~30 sec)
- Installs F5-TTS + PyTorch (~3-5 min, downloads ~2 GB)
- Loads the model (~30 sec, downloads ~1 GB on first generation)

After that, every subsequent run is **instant** — just double-click and it's ready in ~30 sec.

### Step 3 — Use it

The Voice Clone tab in AI Studio (in the React app) **auto-detects** when this server is running. You'll see a green "✓ Local server running" badge. Then record + type + generate as normal — except now it's truly free, truly reliable, no third-party servers.

## Multi-PC access via Tailscale (free)

So you can use voice cloning from your laptop while F5-TTS runs on your desktop.

### One-time per device (5 min each)

1. **On every PC** (desktop + laptop): go to https://tailscale.com/download/windows → click Download → install → sign in with the same Google/Microsoft account on each.
2. Tailscale runs silently in your system tray. It assigns each device a private hostname like `monica-desktop.tail12345.ts.net` (you'll see it in the Tailscale tray menu under "This machine").

### Tell AI Studio where to look

1. On your **main PC** (the one running F5-TTS): find its Tailscale hostname (right-click Tailscale tray icon → "This machine" — it's the name like `monica-desktop`).
2. On your **other PCs**: open the AI Studio → Voice Clone tab → Server settings (gear icon) → paste:
   ```
   http://YOUR-DESKTOP-NAME.tailXXXXX.ts.net:7860
   ```
   (replace with your actual Tailscale hostname)
3. Click "Save & Test". Banner turns green = good to go from this laptop forever.

### How it works
- Tailscale creates a private VPN-like network between **only your authenticated devices**
- No port forwarding, no exposing your PC to the internet
- The voice server is only reachable by devices signed in to your Tailscale account
- Tailscale's free tier supports 100 devices, never expires

## Daily use

- Double-click `start.bat`
- Leave the window open while you use voice cloning in the app
- Close the window (or press Ctrl+C in it) when you're done

You can pin the bat file to your Start menu or taskbar for one-click access.

## Notes

- **CPU vs GPU:** This installs CPU-only PyTorch by default. Generations take 10-30 sec per sentence on CPU. If you have an NVIDIA GPU and want it faster, install CUDA PyTorch separately — but CPU is fine for occasional use.
- **Privacy:** Everything stays on your computer. Your voice samples are never uploaded anywhere.
- **License:** F5-TTS is Apache 2.0 — fully OK for commercial real estate use, no royalties, no restrictions.
- **Storage:** The full install takes ~3-4 GB on disk (Python venv + model weights). It all lives in this `tools/voice-clone-server/` folder.

## Troubleshooting

**"Python is not installed or not in your PATH"** — see Step 1, you missed the PATH checkbox.

**Install step fails partway** — make sure you have ~5 GB free disk space and a working internet connection. Re-run `start.bat`; it'll resume from where it failed.

**"Model failed to load"** in the server window — delete the `venv` folder inside `tools/voice-clone-server/` and re-run `start.bat`. This forces a clean reinstall.

**The AI Studio page still says "local server not running"** — make sure the start.bat window is open AND shows "Listening on http://127.0.0.1:7860". If port 7860 is taken by something else, that's the conflict.
