#!/usr/bin/env bash
# Installs everything the dental-aftercare-video skill needs. Run once per machine:
#   bash setup/install.sh                    # required tools
#   bash setup/install.sh --with-references  # also downloads the animate and motion-prompt skills (optional, for reference)
# Works on Linux and macOS, and on Windows inside Git Bash or WSL.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor"
mkdir -p "$VENDOR/kokoro" "$VENDOR/rhubarb"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. $2"; exit 1; }; }
need node "Install Node.js 18 or newer from nodejs.org."
need ffmpeg "Install ffmpeg (ffmpeg.org) and make sure it is on PATH."
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
need $PY "Install Python 3.10 or newer from python.org."

pipi() { $PY -m pip install -q "$@" 2>/dev/null || $PY -m pip install -q --break-system-packages "$@"; }

echo "1/5 Python packages (kokoro-onnx, soundfile, numpy)"
pipi kokoro-onnx soundfile numpy

echo "2/5 Playwright + Chromium (renders the frames)"
if ! node -e "require('playwright')" 2>/dev/null && ! node -e "require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright')" 2>/dev/null; then
  npm install -g playwright
  npx playwright install chromium
fi

echo "3/5 Kokoro voice model (Apache 2.0) from GitHub releases"
K=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[ -s "$VENDOR/kokoro/kokoro-v1.0.onnx" ] || curl -sSfL -o "$VENDOR/kokoro/kokoro-v1.0.onnx" "$K/kokoro-v1.0.onnx"
[ -s "$VENDOR/kokoro/voices-v1.0.bin" ] || curl -sSfL -o "$VENDOR/kokoro/voices-v1.0.bin" "$K/voices-v1.0.bin"

echo "4/5 Rhubarb Lip Sync (MIT)"
if [ ! -e "$VENDOR/rhubarb/rhubarb" ] && [ ! -e "$VENDOR/rhubarb/rhubarb.exe" ]; then
  case "$(uname -s)" in
    Linux*) OS=Linux ;;
    Darwin*) OS=macOS ;;
    MINGW*|MSYS*|CYGWIN*) OS=Windows ;;
    *) echo "Unknown OS $(uname -s)"; exit 1 ;;
  esac
  TMP="$(mktemp -d)"
  curl -sSfL -o "$TMP/rh.zip" "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.13.0/Rhubarb-Lip-Sync-1.13.0-$OS.zip"
  (cd "$TMP" && unzip -q rh.zip)
  cp -R "$TMP"/Rhubarb-Lip-Sync-1.13.0-*/. "$VENDOR/rhubarb/"
  rm -rf "$TMP"
fi

echo "5/5 Optional: faster-whisper for exact word timing (captions fall back to estimates without it)"
pipi faster-whisper || echo "   faster-whisper not installed; word times will be estimated."

if [ "$1" = "--with-references" ]; then
  mkdir -p "$VENDOR/references"
  [ -d "$VENDOR/references/animate" ] || git clone --depth 1 https://github.com/cth9191/animate.git "$VENDOR/references/animate"
  [ -d "$VENDOR/references/motion-prompt" ] || git clone --depth 1 https://github.com/showheyohtaki/motion-prompt.git "$VENDOR/references/motion-prompt"
fi

echo "Done. Check with: $PY engine/make_video.py --template test-bright-dental --check"
