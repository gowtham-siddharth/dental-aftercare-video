#!/usr/bin/env python3
"""Soft background music and small sound effects, made in code (nothing to license), mixed under the voice.

usage: python3 engine/music.py <build_dir> <settings.json>
reads  <build_dir>/voice.wav and <build_dir>/timeline.json
writes <build_dir>/mix.wav (voice + music + sfx, not yet loudness-normalised)
"""
import json, os, sys
import numpy as np
import soundfile as sf

SR = 24000


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def pad(duration):
    """Calm I-V-vi-IV progression in C, 80 bpm, soft sine pad plus a gentle plucked arpeggio."""
    n = int(duration * SR); t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float64)
    chords = [[48, 55, 60, 64, 67], [43, 50, 59, 62, 67], [45, 52, 57, 60, 64], [41, 48, 57, 60, 65]]
    beat = 60 / 80; bar = beat * 4; seg = bar * 2
    for i in range(int(duration / seg) + 2):
        c = chords[i % 4]; s0 = i * seg
        a, b = int(s0 * SR), min(n, int((s0 + seg + 0.6) * SR))
        if a >= n: break
        tt = t[a:b] - s0
        env = np.minimum(1, tt / 1.2) * np.minimum(1, np.maximum(0, (seg + 0.6 - tt) / 1.0))
        for m in c:
            f = note(m)
            out[a:b] += env * (np.sin(2 * np.pi * f * tt) * 0.6 + np.sin(2 * np.pi * f * 2 * tt) * 0.08) / len(c)
        # arpeggio: eighth notes over the chord's upper tones
        for k in range(int(seg / (beat / 2))):
            st = s0 + k * beat / 2
            m = c[2 + (k % 3)] + 12
            a2, b2 = int(st * SR), min(n, int((st + 0.9) * SR))
            if a2 >= n: break
            tt2 = t[a2:b2] - st
            out[a2:b2] += 0.18 * np.sin(2 * np.pi * note(m) * tt2) * np.exp(-tt2 * 5.0) * np.minimum(1, tt2 / 0.005)
    fade = np.minimum(1, t / 1.5) * np.minimum(1, (duration - t) / 2.0)
    return out * np.clip(fade, 0, 1)


def whoosh(length=0.45, seed=1):
    rng = np.random.default_rng(seed)
    n = int(length * SR); x = rng.standard_normal(n)
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    # crude moving-average low-pass that opens up over the sweep
    y = np.zeros(n); acc = 0.0
    for i in range(n):
        k = 0.02 + 0.25 * i / n
        acc += k * (x[i] - acc); y[i] = acc
    return y * env


def pop(freq=880, length=0.12):
    n = int(length * SR); t = np.arange(n) / SR
    f = freq * (1 - 0.25 * t / length)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35)


def chime():
    n = int(1.2 * SR); t = np.arange(n) / SR; y = np.zeros(n)
    for i, m in enumerate([72, 76, 79]):
        d = int(i * 0.09 * SR)
        y[d:] += np.sin(2 * np.pi * note(m) * t[: n - d]) * np.exp(-t[: n - d] * 4)
    return y / 3


def place(track, clip, at):
    i = int(at * SR)
    if i >= len(track): return
    j = min(len(track), i + len(clip)); track[i:j] += clip[: j - i]


def main():
    build, settings = sys.argv[1], sys.argv[2]
    cfg = json.load(open(settings)); tl = json.load(open(os.path.join(build, "timeline.json")))
    voice, sr = sf.read(os.path.join(build, "voice.wav")); assert sr == SR
    n = len(voice); dur = n / SR
    speech = np.abs(voice) > 0.01
    vrms = np.sqrt(np.mean(voice[speech] ** 2)) if speech.any() else 0.1

    music = np.zeros(n)
    if cfg.get("music", True):
        music = pad(dur)
        # duck a little more while someone speaks
        win = int(0.25 * SR); env = np.convolve(np.abs(voice), np.ones(win) / win, mode="same")
        duck = 1 - 0.35 * np.clip(env / (env.max() + 1e-9) * 4, 0, 1)
        music *= duck
        mrms = np.sqrt(np.mean(music ** 2)) + 1e-9
        music *= vrms * 10 ** (cfg.get("music_db_under_voice", -22) / 20) / mrms

    sfx = np.zeros(n)
    if tl.get("show_title"): place(sfx, chime(), 0.25)
    for i, p in enumerate(tl["parts"]):
        place(sfx, whoosh(seed=i + 1), max(0, p["t0"] - 0.45))
        for ln in p["lines"]:
            if ln.get("card"): place(sfx, pop(990 if p["style"] == "normal" else 660), ln["t0"] + 0.05)
    srms = np.sqrt(np.mean(sfx[np.abs(sfx) > 1e-4] ** 2)) + 1e-9 if np.any(np.abs(sfx) > 1e-4) else 1
    sfx *= vrms * 10 ** (-16 / 20) / srms

    mix = voice + music + sfx
    peak = np.abs(mix).max()
    if peak > 0.97: mix *= 0.97 / peak
    sf.write(os.path.join(build, "mix.wav"), mix.astype(np.float32), SR)
    print(f"music: {dur:.1f}s mixed")


if __name__ == "__main__":
    main()
