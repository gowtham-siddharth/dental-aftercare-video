#!/usr/bin/env node
// Renders the middle video's picture: a headless browser calls window.renderFrame(t) for every frame,
// and ffmpeg encodes the frames. Several browser pages work in parallel on separate stretches of frames;
// their pieces are made with identical settings, so they join without re-encoding.
//
// usage:
//   node engine/render.mjs <build_dir> --out video.mp4 --width 1080 --height 1920 --fps 30
//        [--pix_fmt yuv420p] [--profile high] [--level 4.0] [--workers 4]
//   node engine/render.mjs <build_dir> --stills 3.5,12,40 --out stills.png    (a contact strip of single frames)
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim();
  ({ chromium } = require(path.join(g, 'playwright')));
}

const args = process.argv.slice(2);
const build = path.resolve(args[0]);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('width', 1080), H = +opt('height', 1920);
const FPS_STR = String(opt('fps', '30'));
const FPS = FPS_STR.includes('/') ? FPS_STR.split('/').reduce((a, b) => +a / +b) : +FPS_STR;
const out = path.resolve(opt('out', path.join(build, 'video.mp4')));
const workers = +opt('workers', 4);
const timeline = JSON.parse(fs.readFileSync(path.join(build, 'timeline.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(build, 'config.json'), 'utf8'));
config.width = W; config.height = H;

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([tl, cfg]) => { window.TIMELINE = tl; window.CONFIG = cfg; }, [timeline, config]);
  await page.goto(pathToFileURL(path.join(build, 'scene.html')).href);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 20000 });
  if (errors.length) throw new Error('scene error: ' + errors.join('; '));
  return page;
}

async function grab(page, t, type = 'image/jpeg') {
  const b64 = await page.evaluate(([t, type]) => { window.renderFrame(t); return document.getElementById('c').toDataURL(type, 0.96).split(',')[1]; }, [t, type]);
  return Buffer.from(b64, 'base64');
}

async function stills() {
  const times = opt('stills').split(',').map(Number);
  const browser = await chromium.launch();
  const page = await openPage(browser);
  const dir = fs.mkdtempSync(path.join(build, 'stills-'));
  const files = [];
  for (const [i, t] of times.entries()) { const f = path.join(dir, `${i}.png`); fs.writeFileSync(f, await grab(page, t, 'image/png')); files.push(f); }
  await browser.close();
  const inputs = files.flatMap((f) => ['-i', f]);
  const filter = files.map((_, i) => `[${i}:v]scale=360:-1[s${i}]`).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${files.length}`;
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', files.length > 1 ? filter : '[0:v]scale=360:-1', out]);
  if (r.status) throw new Error(r.stderr.toString());
  console.log('stills:', out);
}

async function video() {
  const total = Math.round(timeline.duration * FPS);
  const per = Math.ceil(total / workers);
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(build, 'seg-'));
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', opt('pix_fmt', 'yuv420p'),
    '-profile:v', opt('profile', 'high'), '-level:v', opt('level', '4.0'), '-r', FPS_STR,
    '-x264-params', `keyint=${Math.round(FPS * 2)}:min-keyint=${Math.round(FPS)}:scenecut=0`, '-video_track_timescale', opt('timescale', String(Math.round(FPS) * 512))];
  const t0 = Date.now();
  const segs = await Promise.all([...Array(workers).keys()].map(async (w) => {
    const a = w * per, b = Math.min(total, a + per);
    if (a >= b) return null;
    const page = await openPage(browser);
    const seg = path.join(tmp, `seg${w}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', FPS_STR, '-c:v', 'mjpeg', '-i', '-', ...enc, '-an', seg]);
    let err = ''; ff.stderr.on('data', (d) => (err += d));
    const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(err)) : res())));
    for (let i = a; i < b; i++) {
      const buf = await grab(page, i / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await done; await page.close();
    return seg;
  }));
  await browser.close();
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  if (r.status) throw new Error(r.stderr.toString());
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`video: ${total} frames at ${W}x${H} ${FPS}fps in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
}

(opt('stills') ? stills() : video()).catch((e) => { console.error(e.message || e); process.exit(1); });
