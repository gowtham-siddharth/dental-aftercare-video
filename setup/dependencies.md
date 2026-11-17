# Dependencies

These are downloaded from their original repositories when the skill is set up. They are not copied into this repository.

## Skills

| Skill | Repository | Licence | Use |
|---|---|---|---|
| animate | https://github.com/cth9191/animate | MIT | Story, look and storyboard check-ins, drawing, render to MP4 |
| motion-prompt | https://github.com/showheyohtaki/motion-prompt | MIT | Optional motion polish |

## Free tools

| Tool | Use |
|---|---|
| Node.js 18+ | Runs the drawing code |
| Playwright + Chromium | Captures frames |
| ffmpeg | Encodes video and audio |
| Python 3 | Runs Kokoro and faster-whisper |
| Kokoro | Voices |
| faster-whisper | Word timings for captions |
| Rhubarb Lip Sync | Mouth shapes for lip sync |

## Download

Run setup/install.sh. It clones the skills into vendor/ (ignored by git).
