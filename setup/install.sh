#!/usr/bin/env bash
# Downloads the skills this skill depends on into vendor/.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor"
mkdir -p "$VENDOR"
[ -d "$VENDOR/animate" ] || git clone --depth 1 https://github.com/cth9191/animate.git "$VENDOR/animate"
[ -d "$VENDOR/motion-prompt" ] || git clone --depth 1 https://github.com/showheyohtaki/motion-prompt.git "$VENDOR/motion-prompt"
echo "Dependencies ready in $VENDOR"
