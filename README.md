# dental-aftercare-video

A Claude skill for making 2D animated post-op care videos for dental clinics, with a talking dentist and patient, using free tools only.

**Final video = the clinic's own intro + a middle video made by Claude + the clinic's own outro.**
The clinic's videos are never edited; the middle video is made in their exact format and the three are joined without re-encoding.

## Quick start

1. Install once: `bash setup/install.sh`
2. Put a clinic's `intro.mp4` and `outro.mp4` in `project-template/templates/<clinic>/`
3. Ask Claude: "make the tooth extraction video for <clinic>"

A fake test clinic (`test-bright-dental`) and a DRAFT tooth extraction script are included for testing.

See `SKILL.md` for the full process and `setup/dependencies.md` for the tools and licences.

Scripts contain medical advice and must be approved by a qualified dentist before any video reaches patients.
