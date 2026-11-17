#!/usr/bin/env python3
"""Voices, lip sync and word timing for one script.

For every line: Kokoro speaks it (one WAV per line), Rhubarb works out the mouth shapes,
and each word gets a start and end time (faster-whisper when it is installed and its model
can load, otherwise estimated from the letters inside the spoken part of the line).
Then the lines are placed on one timeline with the pauses from settings.json.

usage: python3 engine/voice.py <script.json> <settings.json> <build_dir> [--vendor DIR]
writes <build_dir>/voice.wav, <build_dir>/timeline.json, <build_dir>/lines/NN.wav
"""
import json, os, re, subprocess, sys, argparse
import numpy as np
import soundfile as sf

SR = 24000


def load_kokoro(vendor):
    from kokoro_onnx import Kokoro
    return Kokoro(os.path.join(vendor, "kokoro", "kokoro-v1.0.onnx"),
                  os.path.join(vendor, "kokoro", "voices-v1.0.bin"))


def rhubarb_bin(vendor):
    for name in ("rhubarb", "rhubarb.exe"):
        p = os.path.join(vendor, "rhubarb", name)
        if os.path.exists(p):
            return p
    raise SystemExit("Rhubarb not found in vendor/rhubarb. Run setup/install.sh first.")


def speech_bounds(audio, thr=0.02):
    """Start and end (s) of the audible part of a line."""
    env = np.abs(audio)
    idx = np.where(env > thr * max(env.max(), 1e-6))[0]
    if len(idx) == 0:
        return 0.0, len(audio) / SR
    return idx[0] / SR, idx[-1] / SR


def estimate_words(text, t0, t1):
    words = text.split()
    weights = []
    for w in words:
        wgt = len(re.sub(r"[^A-Za-z0-9]", "", w)) + 1.5
        if re.search(r"[,.;:!?]$", w):
            wgt += 2.5  # a little pause after punctuation
        weights.append(wgt)
    total = sum(weights) or 1
    out, t = [], t0
    for w, wgt in zip(words, weights):
        d = (t1 - t0) * wgt / total
        out.append({"w": w, "t0": round(t, 3), "t1": round(t + d * 0.92, 3)})
        t += d
    return out


_whisper = None


def whisper_words(path, text):
    """Word times from faster-whisper, or None when it is not available."""
    global _whisper
    try:
        if _whisper is None:
            from faster_whisper import WhisperModel
            _whisper = WhisperModel("small.en", device="cpu", compute_type="int8")
        segs, _ = _whisper.transcribe(path, word_timestamps=True, initial_prompt=text)
        words = [{"w": w.word.strip(), "t0": round(w.start, 3), "t1": round(w.end, 3)} for s in segs for w in s.words]
        # use the script's own spelling when the counts match
        src = text.split()
        if len(words) == len(src):
            for w, s in zip(words, src):
                w["w"] = s
            return words
        return None
    except Exception:
        _whisper = False if _whisper is None else _whisper
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script"); ap.add_argument("settings"); ap.add_argument("build")
    ap.add_argument("--vendor", default=os.path.join(os.path.dirname(__file__), "..", "vendor"))
    a = ap.parse_args()
    script = json.load(open(a.script)); cfg = json.load(open(a.settings))
    os.makedirs(os.path.join(a.build, "lines"), exist_ok=True)
    kok = load_kokoro(a.vendor); rh = rhubarb_bin(a.vendor)

    t = cfg.get("title_seconds", 2.6) if script.get("show_procedure_title", True) else 0.6
    chunks, parts, n = [], [], 0
    timing_source = "estimated"
    for pi, part in enumerate(script["parts"]):
        if pi > 0:
            t += cfg.get("pause_between_parts", 0.9)
        p = {"title": part["title"], "style": part.get("style", "normal"), "t0": round(t, 3), "lines": []}
        for li, line in enumerate(part["lines"]):
            if li > 0:
                t += cfg.get("pause_between_lines", 0.35)
            v = cfg["voices"][line["speaker"]]
            audio, sr = kok.create(line["text"], voice=v["voice"], speed=v.get("speed", 1.0), lang=cfg.get("lang", "en-us"))
            assert sr == SR
            audio = np.asarray(audio, dtype=np.float32)
            wav = os.path.join(a.build, "lines", f"{n:02d}.wav"); sf.write(wav, audio, SR)
            txt = os.path.join(a.build, "lines", f"{n:02d}.txt"); open(txt, "w").write(line["text"])
            cues_json = os.path.join(a.build, "lines", f"{n:02d}.mouth.json")
            subprocess.run([rh, "-f", "json", "-d", txt, "--machineReadable", "-o", cues_json, wav],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            cues = [{"t0": round(t + c["start"], 3), "t1": round(t + c["end"], 3), "v": c["value"]}
                    for c in json.load(open(cues_json))["mouthCues"]]
            words = whisper_words(wav, line["text"])
            if words:
                timing_source = "faster-whisper"
            else:
                s0, s1 = speech_bounds(audio)
                words = estimate_words(line["text"], s0, s1)
            words = [{"w": w["w"], "t0": round(t + w["t0"], 3), "t1": round(t + w["t1"], 3)} for w in words]
            dur = len(audio) / SR
            p["lines"].append({**line, "t0": round(t, 3), "t1": round(t + dur, 3), "cues": cues, "words": words, "file": f"lines/{n:02d}.wav"})
            chunks.append((t, audio)); t += dur; n += 1
        p["t1"] = round(t, 3)
        parts.append(p)
    duration = t + cfg.get("tail_seconds", 2.2)

    track = np.zeros(int(duration * SR) + 1, dtype=np.float32)
    for st, au in chunks:
        i = int(round(st * SR)); track[i:i + len(au)] += au
    sf.write(os.path.join(a.build, "voice.wav"), track, SR)

    timeline = {
        "procedure": script["procedure"], "draft": not script.get("approved", False),
        "show_title": script.get("show_procedure_title", True),
        "duration": round(duration, 3), "parts": parts, "word_timing": timing_source,
        "disclaimer": cfg.get("disclaimer", ""),
    }
    json.dump(timeline, open(os.path.join(a.build, "timeline.json"), "w"), indent=1)
    print(f"voice: {n} lines, {duration:.1f}s, word timing {timing_source}")


if __name__ == "__main__":
    main()
