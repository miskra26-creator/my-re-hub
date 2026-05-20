@echo off
REM ============================================================
REM  my-re-hub Voice Clone — Automated Main PC Setup
REM ============================================================
REM  Run this ONCE on your main desktop PC. Installs:
REM    1. Python 3.11 (silent)
REM    2. Tailscale (silent — you'll sign in via browser)
REM    3. F5-TTS + model (~2 GB download, via start.bat)
REM
REM  After this finishes you'll have a desktop shortcut you can
REM  double-click any time to start the voice server.
REM ============================================================

cd /d "%~dp0"
title my-re-hub Voice Clone - Main PC Setup

echo.
echo ============================================================
echo  my-re-hub Voice Clone Server - Main PC Auto Setup
echo ============================================================
echo.
echo This will install:
echo   - Python 3.11
echo   - Tailscale (you'll sign in with Google when prompted)
echo   - F5-TTS voice cloning model (~2 GB download)
echo.
echo You may see Windows security prompts during installs.
echo Click YES on each one.
echo.
echo Total time: ~10-15 min (mostly waiting on downloads).
echo.
pause

REM ---------- [1/5] Verify winget is available ----------
echo.
echo [1/5] Checking for winget (Windows package manager)...
winget --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] winget is not available on this PC.
    echo.
    echo To fix:
    echo   - Make sure Windows is up to date (Settings ^> Windows Update)
    echo   - OR install App Installer from the Microsoft Store
    echo   - OR install manually: https://aka.ms/getwinget
    echo.
    echo Then re-run this script.
    echo.
    pause
    exit /b 1
)
echo [OK] winget is available.

REM ---------- [2/5] Install Python 3.11 ----------
echo.
echo [2/5] Installing Python 3.11...
echo       (Skips automatically if already installed.)
winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements --silent --override "/quiet PrependPath=1 Include_test=0 InstallAllUsers=0"
if errorlevel 1 (
    echo       Note: install command returned non-zero ^(often: already installed^). Continuing.
)
echo [OK] Python step complete.

REM ---------- [3/5] Install Tailscale ----------
echo.
echo [3/5] Installing Tailscale...
winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements --silent
if errorlevel 1 (
    echo       Note: install command returned non-zero ^(often: already installed^). Continuing.
)
echo [OK] Tailscale step complete.

REM ---------- [4/5] Tailscale sign-in ----------
echo.
echo [4/5] Opening Tailscale for sign-in...
echo.
echo   - Click "Log in" in the Tailscale window
echo   - Sign in with the SAME Google account you used on your laptop
echo   - The browser will pop up, authorize, then close the browser
echo   - Look at your system tray (bottom-right) for the Tailscale icon
echo.
start "" "C:\Program Files\Tailscale\Tailscale-ipn.exe" 2>nul
if errorlevel 1 start "" "%LocalAppData%\Programs\Tailscale\Tailscale-ipn.exe" 2>nul

echo.
echo Once Tailscale shows "Connected" in the tray menu, press any key here.
pause

REM ---------- [5/5] Create desktop shortcut + run start.bat ----------
echo.
echo [5/5] Creating desktop shortcut...
set "SHORTCUT=%UserProfile%\Desktop\Voice Clone Server.lnk"
set "TARGET=%~dp0start.bat"
powershell -nop -c "try { $s=(New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.Save(); Write-Host '[OK] Shortcut created on Desktop' } catch { Write-Host '[WARN] Could not create shortcut, but no big deal' }"

REM Display this PC's Tailscale hostname so she can paste it in AI Studio on the laptop
echo.
echo ============================================================
echo  Looking up this PC's Tailscale hostname...
echo ============================================================
"C:\Program Files\Tailscale\tailscale.exe" status --json 2>nul > "%TEMP%\tailscale-status.json"
if errorlevel 1 (
    echo Could not query Tailscale automatically.
    echo Find it manually: right-click Tailscale tray icon ^> "This machine"
) else (
    powershell -nop -c "try { $j = Get-Content '%TEMP%\tailscale-status.json' | ConvertFrom-Json; Write-Host ''; Write-Host '   Your Tailscale URL is:' -ForegroundColor Green; Write-Host ''; Write-Host ('     http://' + $j.Self.DNSName.TrimEnd('.') + ':7860') -ForegroundColor Cyan; Write-Host ''; Write-Host '   Paste that URL into AI Studio (on your LAPTOP) ^> Voice Clone ^> Settings.' -ForegroundColor Yellow; Write-Host '' } catch { Write-Host 'Could not parse Tailscale status — get the URL manually from the tray icon.' }"
    del "%TEMP%\tailscale-status.json" 2>nul
)

echo ============================================================
echo.
echo Now starting F5-TTS voice clone server. First run downloads
echo ~2 GB of model weights and takes ~5 min. Leave this window
echo open while you use voice cloning.
echo.
echo From now on: just double-click "Voice Clone Server" on your
echo Desktop to start the server. No need to re-run this setup.
echo.
pause

REM Hand off to start.bat which sets up venv + installs F5-TTS + runs server
call "%~dp0start.bat"
