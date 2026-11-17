# Dependencies

Everything is free, including for commercial use. `setup/install.sh` installs it; downloaded files go into `vendor/`, which is not uploaded to GitHub.

## Required

| Tool | Licence | Job |
|---|---|---|
| Node.js 18+ | MIT | Runs the frame renderer |
| Playwright + Chromium | Apache 2.0 | Draws each frame in a headless browser |
| ffmpeg | LGPL / GPL | Encodes the middle video, sets loudness, joins intro + middle + outro |
| Python 3.10+ | PSF | Runs the voice and music steps |
| kokoro-onnx | MIT | Runs the Kokoro voice model |
| Kokoro-82M model files | Apache 2.0 | The dentist's and patient's voices (downloaded from GitHub releases) |
| Rhubarb Lip Sync 1.13 | MIT | Picks the mouth shape for every sound |
| numpy, soundfile | BSD | Audio processing |
| Nunito font (in engine/fonts) | SIL Open Font License 1.1 | On-screen text |

## Optional

| Tool | Licence | Job |
|---|---|---|
| faster-whisper | MIT | Exact word timing for captions. Without it, word times are estimated from the letters. Its model downloads from Hugging Face on first use. |
| animate (github.com/cth9191/animate) | MIT | Reference only: the engine follows the same idea (deterministic frames, headless browser, ffmpeg). `install.sh --with-references` downloads it. |
| motion-prompt (github.com/showheyohtaki/motion-prompt) | MIT | Reference only: names for motion moves when changing animations. Keep its credit line if you copy element code. |
