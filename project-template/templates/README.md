# templates/

One folder per clinic template. Each holds the clinic's own videos, which are only read, never edited:

```
templates/<name>/
  intro.mp4       welcome + procedure (parts 1 and 2)
  outro.mp4       contact details (part 7)
  template.json   optional: { "colors": { "primary": "#...", "accent": "#...", "warning": "#..." } }
```

Requirements: H.264 video with an audio track, intro and outro in the same format, vertical 9:16.
Check a template with: `python3 engine/make_video.py --template <name> --check`

`test-bright-dental/` is a fake clinic for testing.
