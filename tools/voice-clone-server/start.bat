@echo off
REM ============================================================
REM  F5-TTS Voice Clone Server — One-click Windows starter
REM ============================================================
REM  First run: creates a Python venv and installs F5-TTS (~3-5 min,
REM    downloads ~2 GB).
REM  After that: just starts the server. Takes ~30 sec to load.
REM ============================================================

cd /d "%~dp0"
title F5-TTS Voice Clone Server
echo.
echo ============================================================
echo  F5-TTS Voice Clone Server
echo ============================================================
echo.

REM ----- Verify Python is installed -----
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo.
    echo Steps to fix:
    echo   1. Download Python 3.11 from https://www.python.org/downloads/
    echo   2. During install, CHECK the box "Add Python to PATH"
    echo   3. Close this window and double-click start.bat again
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python %PYVER% detected.

REM ----- Create venv on first run -----
if not exist venv (
    echo [SETUP] First-run: creating Python virtual environment ^(one-time^)…
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create the virtual environment.
        pause
        exit /b 1
    )
    echo [OK] venv created.
)

REM ----- Activate venv -----
call venv\Scripts\activate.bat

REM ----- Install dependencies on first run -----
if not exist venv\Lib\site-packages\f5_tts (
    echo [SETUP] Installing F5-TTS + dependencies. This takes 3-5 min and
    echo         downloads ~2 GB on first run. Subsequent starts are instant.
    echo.
    python -m pip install --upgrade pip --quiet
    if errorlevel 1 ( echo [ERROR] pip upgrade failed. && pause && exit /b 1 )

    echo [1/3] Installing PyTorch (CPU build — fine for occasional use)…
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
    if errorlevel 1 ( echo [ERROR] PyTorch install failed. && pause && exit /b 1 )

    echo [2/3] Installing Flask + audio libs…
    pip install flask flask-cors soundfile --quiet
    if errorlevel 1 ( echo [ERROR] Flask install failed. && pause && exit /b 1 )

    echo [3/3] Installing F5-TTS…
    pip install f5-tts --quiet
    if errorlevel 1 ( echo [ERROR] F5-TTS install failed. && pause && exit /b 1 )

    echo [OK] All dependencies installed.
    echo.
)

REM ----- Start the server -----
echo [RUN] Starting voice clone server…
echo       The first generation downloads model weights ^(~1 GB^) — go grab coffee.
echo       After that, generations are ~10-30 sec on CPU.
echo.
python server.py

REM Server exited (Ctrl+C or crash)
echo.
echo Server stopped. Press any key to close this window.
pause
