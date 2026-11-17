# characters/

The dentist and patient, drawn as code puppets in the flat 2D style of refs/.

| File | What it is |
|---|---|
| characters.js | The drawing code. `Characters.draw(ctx, 'dentist' or 'patient', state)` draws one character on a canvas. |
| character_sheet.png | Preview of poses, expressions and the 9 lip-sync mouth shapes, for approval. |
| sheet.html | Draws the character sheet in a browser. |
| render.js | Saves sheet.html as character_sheet.png (`node render.js sheet.html character_sheet.png 2400 2300`). |

State options: mouth (X, A-H, smile, bigSmile, talkHappy, sad), eyes (open, blink, happy), brows (neutral, raised, worried, happy), armL / armR (rest, gesture, point, thumbsUp, wave, chin, or { up, fore, hand } for smooth blends), headTilt, lookX, breathe, flip, scale.

Status: draft v1, waiting for approval. Locked after approval.
