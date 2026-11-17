---
name: dental-aftercare-video
description: Make 2D animated post-op care videos for dental clinics with a talking dentist and patient, joined between the clinic's own intro and outro videos, using free tools only.
---

# Dental Aftercare Video

Makes a vertical aftercare video for one procedure and one clinic:

**final video = clinic's intro.mp4 + Claude's middle video (4 parts) + clinic's outro.mp4**

The middle video has a cartoon dentist and patient talking (lip sync, word-by-word captions, advice cards, soft music). Every frame is drawn in code. The clinic's intro and outro are never edited: the middle video is made in their exact format and the three are joined without re-encoding.

All paths below are relative to this skill's folder. The working project is `project-template/` unless the user names another folder with the same layout.

## How the user asks

- "make the tooth extraction video for bright-dental" -> make one video
- "new procedure: root canal" -> draft a script, stop for dentist approval
- "new template: smile-clinic" -> check the clinic's intro and outro
- "part 3, shorter" or "card 2 in part 1, say ..." -> edit the script and re-render
- "set up the skill" -> run setup

## Hard rules

1. **Free tools only**, including for commercial use. Never use a paid service or a free tier that forbids commercial use (for example ElevenLabs free plan, Edge TTS).
2. **2D only.** No 3D, Blender or Three.js.
3. **Never invent medical advice.** Claude may draft a script, but it stays `"approved": false` until the user records a dentist's approval (`approved_by`, `approved_on`). Unapproved scripts only produce `-DRAFT.mp4` videos with a red "DRAFT · NOT FOR PATIENTS" label. Set `approved` to true only when the user tells you which dentist approved it and when, and record both.
4. **Never touch the template videos.** `templates/<name>/intro.mp4` and `outro.mp4` are only read. If they cannot be joined as they are, stop and tell the user why (the engine reports it).
5. **Locked look.** Do not change `project-template/characters/` or the style in `engine/scene.js` without the user's explicit permission.
6. **Privacy.** No real patient names, photos or data in any video.
7. Do not use em dashes in text written for the user.

## Folder layout

```
SKILL.md                    this file
setup/install.sh            installs everything (run once per machine)
setup/dependencies.md       what gets installed and why
engine/                     the video engine (do not edit for a single video)
  make_video.py             runs the whole pipeline
  voice.py                  Kokoro voices, Rhubarb lip sync, word timing
  music.py                  background music and sound effects, made in code
  scene.html, scene.js      draws every frame: room, characters, cards, captions
  render.mjs                headless browser + ffmpeg -> middle video
  fonts/                    Nunito (SIL Open Font License)
project-template/
  CLAUDE.md                 house rules for the project
  settings.json             voices, pauses, colours, disclaimer
  refs/                     the reference images the style came from
  characters/               approved, locked dentist and patient (characters.js + sheet)
  templates/<name>/         one folder per clinic template: intro.mp4, outro.mp4, template.json
  scripts/<procedure>.json  one script per procedure (the 4 middle parts)
  out/<template>/           finished videos, reports and contact sheets (not uploaded to GitHub)
vendor/                     downloaded by setup (not uploaded to GitHub)
```

## Setup (once per machine)

Run `bash setup/install.sh`. It needs Node 18+, Python 3.10+ and ffmpeg, then installs Playwright + Chromium, kokoro-onnx, the Kokoro model files (from GitHub releases) and Rhubarb Lip Sync into `vendor/`. It tries to install faster-whisper for exact word timing; if that or its model is not available, word times are estimated from the letters (works, slightly less precise captions).

Check it worked: `python3 engine/make_video.py --template test-bright-dental --check` prints `template ok`.

## Make a video

1. Confirm the template exists: `project-template/templates/<template>/intro.mp4` and `outro.mp4`. Run the `--check` command above with that template. If it lists problems, tell the user exactly what they are and stop. Do not convert the clinic's videos.
2. Confirm the script exists: `project-template/scripts/<procedure>.json`. If not, follow "New procedure" below.
3. Run:
   ```
   python3 engine/make_video.py --template <template> --procedure <procedure>
   ```
   About 3 minutes for a 60-second middle part on a 2-core machine. Use `--workers` up to the number of CPU cores.
4. Read `out/<template>/<procedure>-report.json`. `ok` must be true, `decode_errors` empty, `duration` within 0.5 s of `expected_duration`.
5. Open `out/<template>/<procedure>-contact.png` (one frame every 2.5 s) and look at it. Check: no text cut off or overlapping, advice cards above the characters' heads, captions readable, the warning part red, the DRAFT label present if not approved.
6. Tell the user in a few lines: where the video is, its length, whether it is a DRAFT, and anything that needs them.

## New procedure

1. Copy the structure of `scripts/tooth-extraction.json`: exactly 4 parts. Parts 1 to 3 have `"style": "normal"`, the last part (when to call the clinic) has `"style": "warning"`.
2. Each line: `speaker` (`patient` or `dentist`), `text` (under about 12 words, plain spoken English), optional `card` (the short on-screen point, under about 40 characters) and optional `mood` (`worried` or `happy`). The patient asks, the dentist answers. End with a short thank-you from the patient (`"mood": "happy"`).
3. Use only standard, widely given aftercare advice. Never name medicines or doses; pain relief is always "only what your dentist advised".
4. Save with `"approved": false` and tell the user it needs a dentist's review. A DRAFT video can be made for that review.

## New template (a clinic's intro and outro)

1. The user puts `intro.mp4` and `outro.mp4` into `project-template/templates/<name>/`. Optionally a `template.json` with the clinic's colours: `{ "colors": { "primary": "#...", "accent": "#...", "warning": "#..." } }`.
2. Run the `--check` command. It needs: H.264 video, an audio track, intro and outro in the same format, and a vertical 9:16 size. Any size or frame rate works; the middle video is made to match.
3. If the procedure name is not in the clinic's intro, keep `"show_procedure_title": true` in the script so the middle video opens with it.

## Edits

The user names a part and a change, for example "part 2, card 3 shorter". Change only that in the script JSON, re-run `make_video.py`, and reply in one line with what changed. Changing approved text makes the script unapproved again: set `"approved": false` and tell the user.

## Voices and settings

`project-template/settings.json`: `voices.dentist` and `voices.patient` (Kokoro voice ids, for example `af_heart`, `am_michael`, `bf_emma`, `bm_george`; Hindi voices `hf_alpha`, `hm_omega`), speed, pauses between lines and parts, music on or off and its level, colours, and the disclaimer line shown at the end of the middle video.

## Limits

- Characters face the viewer (no turned or seated poses yet).
- Templates must be H.264 with audio. Anything else is reported, not converted.
- Free AI voices are clear but not fully human. A staff recording can replace a line's WAV in a later version.
