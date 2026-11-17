// The middle video: 4 aftercare parts with a talking dentist and patient.
// window.renderFrame(t) paints exactly what the screen shows at second t. Nothing runs on a timer,
// so any frame can be drawn on its own and the same t always gives the same picture.
//
// Inputs (set before load by engine/render.mjs):
//   window.TIMELINE  from engine/voice.py (parts, lines, mouth cues, word times, duration)
//   window.CONFIG    { width, height, colors: { primary, accent, warning }, disclaimer }
// Layout is designed on a 1080x1920 canvas and scaled to the template's size.
(function () {
  const TL = window.TIMELINE, CFG = window.CONFIG || {};
  const W = 1080, H = 1920;
  const SAFE_TOP = 120, SAFE_BOTTOM = 1600; // keep text out of the top 120 px and bottom 320 px
  const FLOOR = 1390, GROUND = 1398;
  const INK = '#2B2D42';
  const COL = Object.assign({ primary: '#2A7FBA', accent: '#F2A541', warning: '#D64545' }, CFG.colors || {});
  const POS = { patient: 300, dentist: 790 };

  const canvas = document.getElementById('c');
  canvas.width = CFG.width || W; canvas.height = CFG.height || H;
  const ctx = canvas.getContext('2d');

  // ---- helpers --------------------------------------------------------------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => k * k * (3 - 2 * k);
  // closed-form spring: 0 before start, settles at 1 with a small overshoot
  const spring = (dt) => dt <= 0 ? 0 : 1 - Math.exp(-7 * dt) * Math.cos(11 * dt);
  const font = (w, px) => `${w} ${px}px Nunito, sans-serif`;

  function rr(x, y, w, h, r) { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; }
  function fillOut(p, fill, lw = 4) { ctx.fillStyle = fill; ctx.fill(p); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(p); }

  function wrap(text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- what is happening at time t ---------------------------------------------
  const ALL_LINES = [];
  TL.parts.forEach((p, pi) => p.lines.forEach((l, li) => ALL_LINES.push({ ...l, pi, li })));

  function activeLine(t, pad = 0) { return ALL_LINES.find((l) => t >= l.t0 && t <= l.t1 + pad); }
  function partAt(t) {
    let idx = -1;
    TL.parts.forEach((p, i) => { if (t >= p.t0 - 0.6) idx = i; });
    return idx;
  }
  function mouthAt(line, t) {
    if (!line || t < line.t0 || t > line.t1) return null;
    const c = line.cues.find((c) => t >= c.t0 && t < c.t1);
    return c ? c.v : 'X';
  }

  // ---- background ---------------------------------------------------------------
  function drawRoom() {
    ctx.fillStyle = '#EAF6FB'; ctx.fillRect(0, 0, W, FLOOR);
    ctx.fillStyle = '#D9E4EC'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = INK; ctx.fillRect(0, FLOOR - 2, W, 4);
    // window between the two characters
    fillOut(rr(440, 770, 200, 190, 8), '#FFFFFF', 4);
    fillOut(rr(456, 786, 168, 158, 4), '#A9DDF6', 3);
    ctx.fillStyle = '#7DC08A';
    for (const [x, r] of [[480, 30], [520, 36], [575, 30], [610, 26]]) { ctx.beginPath(); ctx.arc(x, 944, r, Math.PI, 0); ctx.fill(); }
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(456, 786, 168, 158);
    ctx.fillStyle = INK; ctx.fillRect(538, 786, 4, 158);
    // plant
    fillOut(rr(52, 1300, 80, 92, 10), '#FFFFFF', 4);
    ctx.save(); ctx.translate(92, 1300);
    for (const [a, l] of [[-0.6, 80], [-0.2, 100], [0.25, 95], [0.65, 75]]) {
      ctx.save(); ctx.rotate(a);
      const p = new Path2D(); p.moveTo(0, 0); p.quadraticCurveTo(-22, -l * 0.55, 0, -l); p.quadraticCurveTo(22, -l * 0.55, 0, 0);
      fillOut(p, '#6BBF8A', 3.5); ctx.restore();
    }
    ctx.restore();
  }

  // ---- characters ---------------------------------------------------------------
  const ARM = Characters.ARM;
  function blendArm(a, b, k) {
    const A = ARM[a], B = ARM[b];
    return { up: lerp(A.up, B.up, k), fore: lerp(A.fore, B.fore, k), hand: k < 0.5 ? A.hand : B.hand };
  }
  // pose of one arm at time t: blends in over 0.3 s when a line starts, back to rest after it ends
  function armFor(who, side, t) {
    for (const l of ALL_LINES) {
      if (l.speaker !== who) continue;
      const target = gestureFor(l, who, side);
      if (!target) continue;
      if (t >= l.t0 - 0.15 && t <= l.t1 + 0.45) {
        const kin = ease(clamp((t - (l.t0 - 0.15)) / 0.3));
        const kout = ease(clamp((t - (l.t1 + 0.15)) / 0.3));
        return blendArm('rest', target, kin * (1 - kout));
      }
    }
    // wave hello during the title
    if (who === 'dentist' && side === 'L' && TL.show_title) {
      const end = (TL.parts[0] ? TL.parts[0].t0 : 2.6) - 0.5;
      if (t < end + 0.3) {
        const k = ease(clamp((t - 0.3) / 0.35)) * (1 - ease(clamp((t - end) / 0.3)));
        const w = blendArm('rest', 'wave', k);
        w.fore += Math.sin(t * 9) * 10 * k; return w;
      }
    }
    return ARM.rest;
  }
  function gestureFor(l, who, side) {
    // dentist stands on the right: her right arm (R) reaches toward the patient
    if (who === 'dentist') return side === 'R' ? 'gesture' : null;
    if (l.mood === 'happy') return side === 'L' ? 'thumbsUp' : null;
    return side === 'L' ? 'gesture' : null;
  }
  function blinkAt(t, seed) {
    const period = 3.3 + seed * 0.6;
    return ((t + seed * 1.9) % period) < 0.13;
  }
  function drawCharacters(t) {
    const line = activeLine(t);
    for (const who of ['patient', 'dentist']) {
      const speaking = line && line.speaker === who && t <= line.t1;
      const seed = who === 'dentist' ? 0 : 1;
      const st = { x: POS[who], y: GROUND, scale: 1, breathe: t / 3.6 + seed * 0.4 };
      st.eyes = blinkAt(t, seed) ? 'blink' : 'open';
      st.lookX = who === 'patient' ? 0.7 : -0.7;
      st.armL = armFor(who, 'L', t); st.armR = armFor(who, 'R', t);
      st.brows = 'neutral'; st.mouth = 'X';
      if (speaking) {
        st.mouth = mouthAt(line, t) || 'X';
        st.headTilt = Math.sin(t * 5.3) * 1.8;
        st.brows = line.mood === 'worried' ? 'worried' : (who === 'patient' ? 'raised' : 'happy');
        if (line.mood === 'happy') { st.brows = 'happy'; }
        st.lookX = who === 'patient' ? 0.5 : -0.3;
      } else {
        st.headTilt = who === 'patient' ? 3 : -3;
        // the patient stays worried until the dentist has answered once
        const last = [...ALL_LINES].reverse().find((l) => l.t1 < t && l.speaker === 'patient' && l.pi === (line ? line.pi : -1));
        if (who === 'patient' && last && last.mood === 'worried' && line && line.speaker === 'dentist' && t < line.t0 + 1.5) { st.brows = 'worried'; st.mouth = 'sad'; }
        if (who === 'patient' && last && last.mood === 'happy') { st.eyes = 'happy'; st.mouth = 'smile'; }
        if (who === 'dentist' && TL.show_title && t < TL.parts[0].t0) { st.mouth = 'smile'; st.brows = 'happy'; }
      }
      Characters.draw(ctx, who, st);
    }
  }

  // ---- text on screen ---------------------------------------------------------------
  function drawTitle(t) {
    if (!TL.show_title) return;
    const end = TL.parts[0].t0 - 0.35;
    if (t > end + 0.35) return;
    const k = spring(t - 0.15), out = ease(clamp((t - end) / 0.35));
    ctx.save(); ctx.globalAlpha = 1 - out;
    ctx.translate(W / 2, 470); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
    fillOut(rr(-430, -150, 860, 300, 40), '#FFFFFF', 5);
    ctx.fillStyle = COL.primary; ctx.font = font(800, 46); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Your aftercare', 0, -62);
    ctx.fillStyle = INK; ctx.font = font(900, 76);
    const lines = wrap(TL.procedure, 780);
    lines.forEach((ln, i) => ctx.fillText(ln, 0, 30 + (i - (lines.length - 1) / 2) * 84));
    ctx.restore();
  }

  function drawHeader(t, pi) {
    if (pi < 0) return;
    const p = TL.parts[pi]; const warn = p.style === 'warning';
    const k = spring(t - (p.t0 - 0.6));
    const next = TL.parts[pi + 1]; const out = next ? ease(clamp((t - (next.t0 - 0.75)) / 0.2)) : 0;
    ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(-260 * (1 - k), 0);
    ctx.font = font(900, 46);
    const label = p.title; const w = ctx.measureText(label).width + 150;
    fillOut(rr(80, 150, w, 92, 46), warn ? COL.warning : COL.primary, 5);
    // part number badge
    fillOut(new Path2D(`M ${80 + 56} 196 m -32 0 a 32 32 0 1 0 64 0 a 32 32 0 1 0 -64 0`), '#FFFFFF', 4);
    ctx.fillStyle = warn ? COL.warning : COL.primary; ctx.font = font(900, 40); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(warn ? '!' : String(pi + 1), 136, 198);
    ctx.fillStyle = '#FFFFFF'; ctx.font = font(900, 46); ctx.textAlign = 'left';
    ctx.fillText(label, 186, 198);
    ctx.restore();
    // progress dots
    for (let i = 0; i < TL.parts.length; i++) {
      const x = W - 100 - (TL.parts.length - 1 - i) * 36;
      ctx.beginPath(); ctx.arc(x, 196, i === pi ? 12 : 9, 0, Math.PI * 2);
      ctx.fillStyle = i <= pi ? (TL.parts[i].style === 'warning' ? COL.warning : COL.primary) : '#FFFFFF';
      ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    }
  }

  function drawCards(t, pi) {
    if (pi < 0) return;
    const p = TL.parts[pi]; const warn = p.style === 'warning';
    const next = TL.parts[pi + 1]; const out = next ? ease(clamp((t - (next.t0 - 0.75)) / 0.3)) : 0;
    // fit all of this part's cards above the characters' heads (bottom limit CARD_BOTTOM):
    // try normal size, then compact; if still too tall, the oldest cards make room for the new one
    const shown = p.lines.filter((l) => l.card && t >= l.t0 - 0.05);
    const CARD_BOTTOM = 740;
    let fs = 40, lh = 48, pad = 52, gap = 16, list = shown, layout;
    const measure = () => { ctx.font = font(800, fs); return list.map((l) => { const ls = wrap(l.card, 700); return { l, ls, h: pad + ls.length * lh }; }); };
    const height = (lay) => lay.reduce((s, c) => s + c.h + gap, 0) - gap;
    layout = measure();
    if (278 + height(layout) > CARD_BOTTOM) { fs = 34; lh = 40; pad = 40; gap = 12; layout = measure(); }
    while (layout.length > 1 && 278 + height(layout) > CARD_BOTTOM) { list = list.slice(1); layout = measure(); }
    let y = 278;
    for (const { l, ls: lines, h } of layout) {
      const k = spring(t - l.t0);
      ctx.save(); ctx.globalAlpha = (1 - out) * clamp((t - l.t0) / 0.12);
      ctx.translate(W / 2, y + h / 2); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-W / 2, -(y + h / 2));
      ctx.translate(40 * out, 0);
      fillOut(rr(80, y, 920, h, 30), '#FFFFFF', 4.5);
      // icon
      const cy = y + h / 2;
      fillOut(new Path2D(`M 152 ${cy} m -36 0 a 36 36 0 1 0 72 0 a 36 36 0 1 0 -72 0`), warn ? COL.warning : COL.primary, 4);
      ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (warn) {
        ctx.beginPath(); ctx.moveTo(152, cy - 18); ctx.lineTo(152, cy + 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(152, cy + 19, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(136, cy + 1); ctx.lineTo(148, cy + 13); ctx.lineTo(170, cy - 12); ctx.stroke();
      }
      ctx.fillStyle = INK; ctx.font = font(800, fs); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach((ln, i) => ctx.fillText(ln, 214, cy + (i - (lines.length - 1) / 2) * lh));
      ctx.restore();
      y += h + gap;
    }
  }

  // word-by-word captions, 2 to 3 words at a time, the spoken word highlighted
  function chunksOf(words) {
    const out = []; let cur = [];
    words.forEach((w) => { cur.push(w); if (cur.length === 3 || /[,.!?;:]$/.test(w.w)) { out.push(cur); cur = []; } });
    if (cur.length) out.push(cur);
    return out;
  }
  function drawCaptions(t) {
    const line = activeLine(t, 0.2);
    if (!line) return;
    const chunks = chunksOf(line.words);
    let ci = 0;
    chunks.forEach((c, i) => { if (t >= c[0].t0 - 0.05) ci = i; });
    const chunk = chunks[ci];
    const warn = TL.parts[line.pi].style === 'warning';
    ctx.font = font(900, 58);
    const parts = chunk.map((w) => w.w);
    const widths = parts.map((s) => ctx.measureText(s).width);
    const space = ctx.measureText(' ').width;
    const total = widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1);
    const y = 1495, x0 = W / 2 - total / 2;
    const k = spring(t - chunk[0].t0 + 0.05);
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); ctx.translate(-W / 2, -y);
    fillOut(rr(x0 - 34, y - 52, total + 68, 104, 52), '#FFFFFF', 4.5);
    let x = x0;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    chunk.forEach((w, i) => {
      const on = t >= w.t0 && t <= w.t1 + 0.12;
      ctx.save();
      if (on) { ctx.translate(x + widths[i] / 2, y); ctx.scale(1.08, 1.08); ctx.translate(-(x + widths[i] / 2), -y); }
      ctx.fillStyle = on ? (warn ? COL.warning : COL.primary) : INK;
      ctx.fillText(parts[i], x, y + 2);
      ctx.restore();
      x += widths[i] + space;
    });
    ctx.restore();
  }

  function drawDisclaimer(t) {
    const last = TL.parts[TL.parts.length - 1];
    if (!TL.disclaimer || t < last.t1 + 0.25) return;
    const k = ease(clamp((t - last.t1 - 0.25) / 0.4));
    ctx.save(); ctx.globalAlpha = k;
    ctx.font = font(800, 36); const w = ctx.measureText(TL.disclaimer).width + 60;
    fillOut(rr(W / 2 - w / 2, 1460, w, 74, 37), '#FFFFFF', 4);
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(TL.disclaimer, W / 2, 1498);
    ctx.restore();
  }

  function drawDraft() {
    if (!TL.draft) return;
    ctx.save(); ctx.font = font(900, 30);
    const label = 'DRAFT · NOT FOR PATIENTS'; const w = ctx.measureText(label).width + 44;
    fillOut(rr(W - w - 40, 54, w, 54, 27), COL.warning, 3.5);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, W - w / 2 - 40, 82); ctx.restore();
  }

  window.renderFrame = function (t) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawRoom();
    drawCharacters(t);
    const pi = partAt(t);
    drawTitle(t);
    drawHeader(t, pi);
    drawCards(t, pi);
    drawCaptions(t);
    drawDisclaimer(t);
    drawDraft();
  };
  window.SAFE = { top: SAFE_TOP, bottom: SAFE_BOTTOM };
  document.fonts.load(font(900, 40)).then(() => document.fonts.load(font(800, 40))).then(() => { window.READY = true; });
})();
