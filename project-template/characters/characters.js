// Dental aftercare characters: a dentist and a patient, drawn as code puppets on a Canvas 2D context.
// Flat 2D vector style matching refs/master.png: flat fills, one dark outline colour, rounded shapes.
// Every part is drawn from a state object, so any frame can be drawn on its own (deterministic).
//
// Usage:
//   Characters.draw(ctx, 'dentist', { x, y, scale, flip, mouth, eyes, brows, armL, armR, headTilt, lookX, breathe })
//   x, y      position of the feet (ground point) on the canvas
//   scale     1 = about 620 px tall
//   flip      true mirrors the character (faces the other way)
//   mouth     'X' rest | 'A'..'H' lip-sync shapes (Rhubarb) | 'smile' | 'bigSmile' | 'sad' | 'talkHappy'
//   eyes      'open' | 'blink' | 'happy'
//   brows     'neutral' | 'raised' | 'worried' | 'happy'
//   armL/armR 'rest' | 'gesture' | 'point' | 'thumbsUp' | 'wave' | 'chin'   (L = character's own left)
//   headTilt  degrees, small values (-8..8)
//   lookX     -1..1 shifts the pupils sideways
//   breathe   0..1 phase of the idle breath (subtle)
//   upper     true draws only from the waist up (for close-ups)
(function (root) {
  const INK = '#2B2D42';
  const OW = 4; // outline width at scale 1

  const LOOKS = {
    dentist: {
      skin: '#A86B4C', skinShade: '#94593D', hair: '#2B1B17',
      top: '#A8D8F0', inner: '#FFFFFF', trousers: '#34495E', shoes: '#FFFFFF',
      sleeve: 'long', headRx: 76, headRy: 82,
    },
    patient: {
      skin: '#C68B66', skinShade: '#B07752', hair: '#1E1A18',
      top: '#6BBF8A', inner: null, trousers: '#3D4A5C', shoes: '#7A5236',
      sleeve: 'short', headRx: 80, headRy: 84,
    },
  };

  // ---- small helpers ------------------------------------------------------
  function fillOut(ctx, path, fill, w = OW) {
    ctx.fillStyle = fill; ctx.fill(path);
    ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(path);
  }
  function ellipse(cx, cy, rx, ry, rot = 0) {
    const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); return p;
  }
  function rrect(x, y, w, h, r) {
    const p = new Path2D(); p.roundRect(x, y, w, h, r); return p;
  }
  // A limb as a thick rounded stroke with an outline: outline stroke first, then the fill stroke.
  function capsule(ctx, pts, width, fill) {
    const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = width + OW * 2; ctx.stroke(p);
    ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.stroke(p);
  }
  function line(ctx, pts, w = OW, color = INK) {
    const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(p);
  }
  const rad = (d) => (d * Math.PI) / 180;
  // Direction for an angle measured from straight down, positive = away from the body on side s (+1 right, -1 left).
  const dir = (a, s) => [s * Math.sin(rad(a)), Math.cos(rad(a))];

  // ---- arm poses: upper arm angle and forearm angle (from straight down, outward positive) ----
  const ARM = {
    rest:     { up: 9,   fore: 4,   hand: 'relaxed' },
    gesture:  { up: 28,  fore: 102, hand: 'open' },
    point:    { up: 72,  fore: 86,  hand: 'point' },
    thumbsUp: { up: 14,  fore: 196, hand: 'thumb' },
    wave:     { up: 128, fore: 168, hand: 'open' },
    chin:     { up: 6,   fore: 198, hand: 'relaxed' },
  };

  function drawHand(ctx, L, kind, wx, wy, ang, s) {
    // ang: forearm direction angle (from down, outward positive) for side s
    const [dx, dy] = dir(ang, s);
    const cx = wx + dx * 12, cy = wy + dy * 12;
    if (kind === 'open') {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      // palm with fingers together
      const p = new Path2D();
      p.moveTo(-13, -6); p.bezierCurveTo(-16, 10, -12, 26, 0, 27); p.bezierCurveTo(12, 26, 16, 10, 13, -6); p.closePath();
      fillOut(ctx, p, L.skin);
      const t = ellipse(-s * 14, 2, 6, 10, s * 0.6); fillOut(ctx, t, L.skin);
      line(ctx, [[-4, 12], [-4, 22]], 2.5); line(ctx, [[4, 12], [4, 22]], 2.5);
      ctx.restore();
    } else if (kind === 'point') {
      const tip = [cx + dx * 30, cy + dy * 30];
      capsule(ctx, [[cx, cy], tip], 12, L.skin);
      fillOut(ctx, ellipse(cx, cy, 18, 16), L.skin);
    } else if (kind === 'thumb') {
      capsule(ctx, [[cx - s * 4, cy - 10], [cx - s * 4, cy - 34]], 13, L.skin);
      fillOut(ctx, rrect(cx - 18, cy - 14, 36, 32, 12), L.skin);
      line(ctx, [[cx - 11, cy], [cx + 11, cy]], 2.5); line(ctx, [[cx - 11, cy + 8], [cx + 11, cy + 8]], 2.5);
    } else {
      // relaxed hand: rounded mitten with a hint of fingers
      fillOut(ctx, ellipse(cx, cy + 2, 14, 17), L.skin);
      line(ctx, [[cx - 4 * s, cy + 6], [cx - 4 * s, cy + 15]], 2.5);
    }
  }

  function drawArm(ctx, L, pose, s) {
    // pose: a name from ARM, or an object { up, fore, hand } (used for smooth blends between poses)
    const A = (pose && typeof pose === 'object') ? pose : (ARM[pose] || ARM.rest);
    const sh = [s * 76, -392];
    const [ux, uy] = dir(A.up, s);
    const el = [sh[0] + ux * 92, sh[1] + uy * 92];
    const [fx, fy] = dir(A.fore, s);
    const wr = [el[0] + fx * 82, el[1] + fy * 82];
    if (L.sleeve === 'long') {
      capsule(ctx, [sh, el, wr], 34, L.top);
      // cuff line
      const cx = wr[0] - fx * 6, cy = wr[1] - fy * 6;
      line(ctx, [[cx - fy * 14, cy + fx * 14], [cx + fy * 14, cy - fx * 14]], 3);
    } else {
      capsule(ctx, [sh, el, wr], 27, L.skin);
      // short sleeve: a flat-ended sleeve shape over the top of the upper arm
      const ox = -s * -uy, oy = -s * ux; // outward perpendicular
      const e = [sh[0] + ux * 54, sh[1] + uy * 54];
      const sv = new Path2D();
      sv.moveTo(s * 44, -408);
      sv.quadraticCurveTo(sh[0] + ox * 16 - ux * 26, sh[1] + oy * 16 - uy * 26, sh[0] + ox * 22, sh[1] + oy * 22);
      sv.lineTo(e[0] + ox * 22, e[1] + oy * 22);
      sv.lineTo(e[0] - ox * 22, e[1] - oy * 22);
      sv.lineTo(s * 62, -330);
      sv.closePath();
      fillOut(ctx, sv, L.top);
    }
    drawHand(ctx, L, A.hand, wr[0], wr[1], A.fore, s);
  }

  // ---- body -----------------------------------------------------------------
  function drawLegs(ctx, L) {
    // shoes
    fillOut(ctx, ellipse(-31, -12, 32, 16), L.shoes);
    fillOut(ctx, ellipse(31, -12, 32, 16), L.shoes);
    // trousers
    fillOut(ctx, rrect(-54, -226, 50, 210, 12), L.trousers);
    fillOut(ctx, rrect(4, -226, 50, 210, 12), L.trousers);
  }

  function drawTorsoDentist(ctx, L) {
    // white top visible in the coat opening
    fillOut(ctx, rrect(-26, -410, 52, 190, 8), L.inner);
    // coat panels
    const left = new Path2D();
    left.moveTo(-14, -412); left.lineTo(-70, -404); left.quadraticCurveTo(-88, -398, -89, -380);
    left.lineTo(-94, -184); left.quadraticCurveTo(-94, -174, -84, -174); left.lineTo(-12, -174); left.lineTo(-12, -300); left.closePath();
    fillOut(ctx, left, L.top);
    const right = new Path2D();
    right.moveTo(14, -412); right.lineTo(70, -404); right.quadraticCurveTo(88, -398, 89, -380);
    right.lineTo(94, -184); right.quadraticCurveTo(94, -174, 84, -174); right.lineTo(12, -174); right.lineTo(12, -300); right.closePath();
    fillOut(ctx, right, L.top);
    // lapels
    line(ctx, [[-14, -410], [-36, -350], [-13, -312]], 3.5);
    line(ctx, [[14, -410], [36, -350], [13, -312]], 3.5);
    // pockets
    fillOut(ctx, rrect(-80, -268, 48, 42, 6), L.top, 3.5);
    fillOut(ctx, rrect(32, -268, 48, 42, 6), L.top, 3.5);
  }

  function drawTorsoPatient(ctx, L) {
    const p = new Path2D();
    p.moveTo(-24, -414); p.lineTo(-72, -404); p.quadraticCurveTo(-88, -398, -88, -380);
    p.lineTo(-84, -232); p.quadraticCurveTo(-84, -218, -70, -218); p.lineTo(70, -218);
    p.quadraticCurveTo(84, -218, 84, -232); p.lineTo(88, -380); p.quadraticCurveTo(88, -398, 72, -404);
    p.lineTo(24, -414); p.quadraticCurveTo(0, -394, -24, -414); p.closePath();
    fillOut(ctx, p, L.top);
    // neckline
    const n = new Path2D(); n.moveTo(-24, -414); n.quadraticCurveTo(0, -394, 24, -414);
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke(n);
  }

  // ---- head ----------------------------------------------------------------
  const HC = [0, -520]; // head centre

  function drawHairBack(ctx, who, L) {
    if (who === 'dentist') {
      // hair silhouette behind the head and the low bun on her right (viewer's left)
      fillOut(ctx, ellipse(-74, -458, 30, 27), L.hair);
      fillOut(ctx, ellipse(HC[0], HC[1] - 6, L.headRx + 8, L.headRy + 8), L.hair);
    }
  }

  function drawHairFront(ctx, who, L) {
    const [cx, cy] = HC;
    if (who === 'dentist') {
      const p = new Path2D();
      p.moveTo(cx - 84, cy + 6);
      p.bezierCurveTo(cx - 92, cy - 70, cx - 48, cy - 98, cx, cy - 96);
      p.bezierCurveTo(cx + 48, cy - 98, cx + 92, cy - 70, cx + 84, cy + 6);
      p.bezierCurveTo(cx + 74, cy - 34, cx + 44, cy - 56, cx + 4, cy - 58); // forehead edge, right side, side part
      p.bezierCurveTo(cx - 26, cy - 50, cx - 66, cy - 30, cx - 84, cy + 6);
      p.closePath();
      fillOut(ctx, p, L.hair);
      // part line
      line(ctx, [[cx + 4, cy - 58], [cx + 14, cy - 88]], 3);
    } else {
      const p = new Path2D();
      p.moveTo(cx - 86, cy - 4);
      p.bezierCurveTo(cx - 96, cy - 74, cx - 50, cy - 112, cx + 4, cy - 106);
      p.bezierCurveTo(cx + 58, cy - 104, cx + 96, cy - 70, cx + 86, cy - 4);
      // spiky fringe from right to left
      p.lineTo(cx + 74, cy - 36); p.lineTo(cx + 60, cy - 30); p.lineTo(cx + 50, cy - 52);
      p.lineTo(cx + 32, cy - 44); p.lineTo(cx + 16, cy - 62); p.lineTo(cx - 4, cy - 50);
      p.lineTo(cx - 22, cy - 64); p.lineTo(cx - 40, cy - 48); p.lineTo(cx - 58, cy - 56);
      p.lineTo(cx - 70, cy - 32); p.closePath();
      fillOut(ctx, p, L.hair);
    }
  }

  function drawEyes(ctx, L, eyes, lookX) {
    const [cx, cy] = HC;
    const ex = 30, ey = cy + 4;
    for (const s of [-1, 1]) {
      const x = cx + s * ex + lookX * 4;
      if (eyes === 'blink') {
        line(ctx, [[x - 10, ey + 1], [x, ey + 5], [x + 10, ey + 1]], 4.5);
      } else if (eyes === 'happy') {
        const p = new Path2D(); p.moveTo(x - 10, ey + 4); p.quadraticCurveTo(x, ey - 10, x + 10, ey + 4);
        ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke(p);
      } else {
        ctx.fillStyle = INK; ctx.fill(ellipse(x, ey, 9, 13));
        ctx.fillStyle = '#FFFFFF'; ctx.fill(ellipse(x + 3, ey - 5, 3.4, 3.8));
      }
    }
  }

  function drawBrows(ctx, brows) {
    const [cx, cy] = HC;
    for (const s of [-1, 1]) {
      const bx = cx + s * 30;
      let inner = cy - 30, outer = cy - 30, mid = cy - 36;
      if (brows === 'raised') { inner -= 8; outer -= 8; mid -= 9; }
      if (brows === 'worried') { inner = cy - 40; outer = cy - 27; mid = cy - 36; }
      if (brows === 'happy') { inner -= 4; outer -= 4; mid -= 8; }
      const p = new Path2D();
      p.moveTo(bx - s * 12, inner); p.quadraticCurveTo(bx, mid, bx + s * 12, outer);
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke(p);
    }
  }

  function drawNose(ctx) {
    const [cx, cy] = HC;
    const p = new Path2D(); p.moveTo(cx - 3, cy + 18); p.quadraticCurveTo(cx + 9, cy + 24, cx + 1, cy + 32);
    ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke(p);
  }

  // Mouth shapes. Rhubarb: A=M/B/P closed, B=clenched (K S T), C=open (E), D=wide (A),
  // E=rounded (O), F=puckered (U W), G=F/V, H=L, X=idle.
  const MOUTH_IN = '#7A2E3A', TONGUE = '#E8707A';
  function openMouth(ctx, mx, my, w, h, opts = {}) {
    const p = new Path2D();
    if (opts.round) { p.ellipse(mx, my, w / 2, h / 2, 0, 0, Math.PI * 2); }
    else if (opts.happy) { p.moveTo(mx - w / 2, my - h * 0.35); p.quadraticCurveTo(mx, my - h * 0.5, mx + w / 2, my - h * 0.35); p.bezierCurveTo(mx + w / 2, my + h * 0.6, mx - w / 2, my + h * 0.6, mx - w / 2, my - h * 0.35); p.closePath(); }
    else { p.roundRect(mx - w / 2, my - h / 2, w, h, Math.min(w, h) / 2); }
    ctx.save(); ctx.fillStyle = MOUTH_IN; ctx.fill(p); ctx.clip(p);
    if (opts.teeth) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(mx - w, my - h / 2 - 2, w * 2, Math.max(4, h * 0.28)); }
    if (opts.tongue) { ctx.fillStyle = TONGUE; ctx.fill(ellipse(mx, my + h * 0.42, w * 0.38, h * 0.32)); }
    if (opts.tongueUp) { ctx.fillStyle = TONGUE; ctx.fill(ellipse(mx, my - h * 0.05, w * 0.22, h * 0.45)); }
    ctx.restore();
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(p);
  }
  function drawMouth(ctx, m) {
    const mx0 = HC[0] + 2, my0 = HC[1] + 50;
    ctx.save(); ctx.translate(mx0, my0); ctx.scale(1.25, 1.25); ctx.translate(-mx0, -my0);
    const mx = mx0, my = my0;
    const curve = (y1, y2, w = 16) => { const p = new Path2D(); p.moveTo(mx - w, my + y1); p.quadraticCurveTo(mx, my + y2, mx + w, my + y1); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke(p); };
    switch (m) {
      case 'A': line(ctx, [[mx - 13, my + 1], [mx + 13, my + 1]], 4.5); break;
      case 'B': openMouth(ctx, mx, my + 1, 28, 11, { teeth: true }); break;
      case 'C': openMouth(ctx, mx, my + 3, 28, 20, { teeth: true, tongue: true }); break;
      case 'D': openMouth(ctx, mx, my + 5, 32, 30, { teeth: true, tongue: true }); break;
      case 'E': openMouth(ctx, mx, my + 3, 18, 22, { round: true, tongue: true }); break;
      case 'F': openMouth(ctx, mx, my + 2, 12, 13, { round: true }); break;
      case 'G': openMouth(ctx, mx, my + 2, 26, 12, { teeth: true }); line(ctx, [[mx - 12, my + 7], [mx + 12, my + 7]], 3.5); break;
      case 'H': openMouth(ctx, mx, my + 3, 26, 20, { teeth: true, tongueUp: true }); break;
      case 'bigSmile': case 'talkHappy': openMouth(ctx, mx, my + 4, 34, 26, { happy: true, tongue: true }); break;
      case 'sad': curve(8, -6, 13); break;
      case 'smile': case 'X': default: curve(-2, 10, 15); break;
    }
    ctx.restore();
  }

  function drawHead(ctx, who, L, st) {
    const [cx, cy] = HC;
    drawHairBack(ctx, who, L);
    // ears
    fillOut(ctx, ellipse(cx - L.headRx + 2, cy + 8, 14, 18), L.skin);
    fillOut(ctx, ellipse(cx + L.headRx - 2, cy + 8, 14, 18), L.skin);
    // face
    fillOut(ctx, ellipse(cx, cy, L.headRx, L.headRy), L.skin);
    drawHairFront(ctx, who, L);
    drawBrows(ctx, st.brows || 'neutral');
    drawEyes(ctx, L, st.eyes || 'open', st.lookX || 0);
    drawNose(ctx);
    drawMouth(ctx, st.mouth || 'X');
  }

  // ---- whole character -------------------------------------------------------
  function draw(ctx, who, st = {}) {
    const L = LOOKS[who];
    const s = st.scale ?? 1;
    const breathe = Math.sin((st.breathe || 0) * Math.PI * 2) * 0.012;
    ctx.save();
    ctx.translate(st.x || 0, st.y || 0);
    ctx.scale(st.flip ? -s : s, s);
    // ground shadow
    if (!st.upper) { ctx.fillStyle = '#E3E8EF'; ctx.fill(ellipse(0, -2, 92, 15)); }
    // breathing: torso and head rise very slightly
    ctx.save();
    ctx.translate(0, -230); ctx.scale(1, 1 + breathe); ctx.translate(0, 230);
    if (!st.upper) drawLegs(ctx, L);
    // neck
    fillOut(ctx, rrect(-16, -452, 32, 52, 8), L.skin);
    // arms behind the body for rest pose are drawn after the torso so they read clearly
    if (who === 'dentist') drawTorsoDentist(ctx, L); else drawTorsoPatient(ctx, L);
    // head, tilted around the neck
    ctx.save();
    ctx.translate(0, -440); ctx.rotate(rad(st.headTilt || 0)); ctx.translate(0, 440);
    drawHead(ctx, who, L, st);
    ctx.restore();
    // arms: character's right is viewer's left (s = -1)
    drawArm(ctx, L, st.armR || 'rest', -1);
    drawArm(ctx, L, st.armL || 'rest', 1);
    ctx.restore();
    ctx.restore();
  }

  root.Characters = { draw, LOOKS, ARM, ARM_POSES: Object.keys(ARM), MOUTHS: ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] };
})(typeof window !== 'undefined' ? window : globalThis);
