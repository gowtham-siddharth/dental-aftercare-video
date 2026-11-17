#!/usr/bin/env python3
"""Make one aftercare video: the clinic's intro + Claude's middle video (4 parts) + the clinic's outro.

The template's intro.mp4 and outro.mp4 are only read, never changed. The middle video is made in their
exact format (size, frame rate, codec settings, audio) so the three join without re-encoding.

usage:
  python3 engine/make_video.py --template <name> --procedure <script-name> [--project project-template] [--workers 4]
  python3 engine/make_video.py --template <name> --check     (only check the template)

reads   <project>/templates/<name>/intro.mp4, outro.mp4, template.json (optional colours)
        <project>/scripts/<procedure>.json, <project>/settings.json
writes  <project>/out/<name>/<procedure>.mp4  (or <procedure>-DRAFT.mp4 when the script is not approved)
        <project>/out/<name>/<procedure>-middle.mp4, <procedure>-contact.png, <procedure>-report.json
"""
import argparse, json, os, shutil, subprocess, sys

ENGINE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ENGINE)


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise SystemExit(f"FAILED: {' '.join(cmd[:3])} ...\n{r.stderr[-2000:]}")
    return r.stdout


def probe(path):
    d = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]))
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    return {
        "duration": float(d["format"]["duration"]),
        "video": v and {k: v.get(k) for k in ("codec_name", "profile", "level", "width", "height", "pix_fmt", "r_frame_rate", "time_base")},
        "audio": a and {k: a.get(k) for k in ("codec_name", "profile", "sample_rate", "channels", "channel_layout", "bit_rate")},
    }


def check_template(tdir):
    """Return (format, problems). The template must be usable without changing it."""
    problems = []
    paths = {k: os.path.join(tdir, f"{k}.mp4") for k in ("intro", "outro")}
    for k, p in paths.items():
        if not os.path.exists(p):
            problems.append(f"{k}.mp4 is missing in {tdir}")
    if problems:
        return None, problems
    i, o = probe(paths["intro"]), probe(paths["outro"])
    for name, p in (("intro", i), ("outro", o)):
        if not p["video"]:
            problems.append(f"{name}.mp4 has no video stream")
        elif p["video"]["codec_name"] != "h264":
            problems.append(f"{name}.mp4 uses {p['video']['codec_name']}; only H.264 templates can be joined without re-encoding")
        if not p["audio"]:
            problems.append(f"{name}.mp4 has no audio track (add a silent track to the template, or ask for re-encoding)")
    if problems:
        return None, problems
    keys_v = ("codec_name", "profile", "width", "height", "pix_fmt", "r_frame_rate")
    keys_a = ("codec_name", "sample_rate", "channels")
    for k in keys_v:
        if i["video"][k] != o["video"][k]:
            problems.append(f"intro and outro differ in video {k}: {i['video'][k]} vs {o['video'][k]}")
    for k in keys_a:
        if i["audio"][k] != o["audio"][k]:
            problems.append(f"intro and outro differ in audio {k}: {i['audio'][k]} vs {o['audio'][k]}")
    w, h = i["video"]["width"], i["video"]["height"]
    if abs(w / h - 9 / 16) > 0.02:
        problems.append(f"template is {w}x{h}; the middle video is designed for vertical 9:16")
    return {"intro": i, "outro": o}, problems


def level_str(level):
    try:
        lv = int(level); return f"{lv // 10}.{lv % 10}"
    except Exception:
        return "4.0"


def profile_str(p):
    p = (p or "high").lower()
    return {"constrained baseline": "baseline"}.get(p, p.split()[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=os.path.join(ROOT, "project-template"))
    ap.add_argument("--template", required=True)
    ap.add_argument("--procedure")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    proj = os.path.abspath(a.project)
    tdir = os.path.join(proj, "templates", a.template)

    fmt, problems = check_template(tdir)
    if problems:
        print("TEMPLATE PROBLEMS (nothing was changed):"); [print(" -", p) for p in problems]; sys.exit(2)
    v, au = fmt["intro"]["video"], fmt["intro"]["audio"]
    print(f"template ok: {v['width']}x{v['height']} {v['r_frame_rate']} fps, {v['profile']} {level_str(v['level'])}, audio {au['codec_name']} {au['sample_rate']} Hz x{au['channels']}")
    if a.check:
        return
    if not a.procedure:
        raise SystemExit("--procedure is required")

    script_path = os.path.join(proj, "scripts", f"{a.procedure}.json")
    script = json.load(open(script_path))
    settings_path = os.path.join(proj, "settings.json"); settings = json.load(open(settings_path))
    tcfg_path = os.path.join(tdir, "template.json")
    tcfg = json.load(open(tcfg_path)) if os.path.exists(tcfg_path) else {}
    approved = bool(script.get("approved")) and bool(script.get("approved_by"))

    out_dir = os.path.join(proj, "out", a.template); os.makedirs(out_dir, exist_ok=True)
    build = os.path.join(out_dir, f".build-{a.procedure}")
    shutil.rmtree(build, ignore_errors=True); os.makedirs(build)

    # 1. voices, lip sync, word timing
    run([sys.executable, os.path.join(ENGINE, "voice.py"), script_path, settings_path, build, "--vendor", os.path.join(ROOT, "vendor")])
    tl_path = os.path.join(build, "timeline.json"); tl = json.load(open(tl_path))
    tl["draft"] = not approved; json.dump(tl, open(tl_path, "w"), indent=1)
    # 2. music and sound effects under the voice
    run([sys.executable, os.path.join(ENGINE, "music.py"), build, settings_path])
    # 3. picture, in the template's exact video format
    for f in ("scene.html", "scene.js"):
        shutil.copy(os.path.join(ENGINE, f), build)
    shutil.copytree(os.path.join(ENGINE, "fonts"), os.path.join(build, "fonts"))
    shutil.copy(os.path.join(proj, "characters", "characters.js"), build)
    colors = {**settings.get("colors", {}), **tcfg.get("colors", {})}
    json.dump({"colors": colors}, open(os.path.join(build, "config.json"), "w"))
    tb = v.get("time_base", "1/15360").split("/")[-1]
    video = os.path.join(build, "video.mp4")
    print(run(["node", os.path.join(ENGINE, "render.mjs"), build, "--out", video,
               "--width", str(v["width"]), "--height", str(v["height"]), "--fps", v["r_frame_rate"],
               "--pix_fmt", v["pix_fmt"], "--profile", profile_str(v["profile"]), "--level", level_str(v["level"]),
               "--timescale", tb, "--workers", str(a.workers)]).strip())
    # 4. sound: loudness -14 LUFS, template's audio format, exactly as long as the picture
    vdur = probe(video)["duration"]
    middle = os.path.join(out_dir, f"{a.procedure}-middle.mp4")
    br = au.get("bit_rate") or "192000"
    run(["ffmpeg", "-y", "-v", "error", "-i", video, "-i", os.path.join(build, "mix.wav"),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-af", f"loudnorm=I=-14:TP=-1.5:LRA=11,aresample={au['sample_rate']},apad",
         "-c:a", "aac", "-ar", str(au["sample_rate"]), "-ac", str(au["channels"]), "-b:a", str(br),
         "-t", f"{vdur:.3f}", "-video_track_timescale", tb, "-movflags", "+faststart", middle])
    # 5. join intro + middle + outro without re-encoding
    name = f"{a.procedure}.mp4" if approved else f"{a.procedure}-DRAFT.mp4"
    final = os.path.join(out_dir, name)
    lst = os.path.join(build, "join.txt")
    with open(lst, "w") as f:
        for p in (os.path.join(tdir, "intro.mp4"), middle, os.path.join(tdir, "outro.mp4")):
            f.write("file '" + p.replace("'", "'\\''") + "'\n")
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", final])
    # 6. checks
    report = {"final": final, "approved": approved, "template": a.template, "procedure": a.procedure, "word_timing": tl.get("word_timing")}
    fp = probe(final); expected = fmt["intro"]["duration"] + probe(middle)["duration"] + fmt["outro"]["duration"]
    report["duration"] = round(fp["duration"], 2); report["expected_duration"] = round(expected, 2)
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", final, "-f", "null", "-"], capture_output=True, text=True)
    report["decode_errors"] = dec.stderr.strip().splitlines()[:10]
    lufs = subprocess.run(["ffmpeg", "-i", middle, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    for ln in reversed(lufs.splitlines()):
        if ln.strip().startswith("I:"):
            report["middle_loudness_lufs"] = float(ln.split()[1]); break
    report["template_untouched"] = True  # intro/outro are only read by ffprobe and the concat demuxer
    contact = os.path.join(out_dir, f"{a.procedure}-contact.png")
    rows = int((fp["duration"] / 2.5) // 8) + 1
    run(["ffmpeg", "-y", "-v", "error", "-i", final, "-vf", f"fps=1/2.5,scale=216:-1,tile=8x{rows}:padding=6:color=white", "-frames:v", "1", contact])
    report["contact_sheet"] = contact
    report["ok"] = abs(report["duration"] - expected) < 0.5 and not report["decode_errors"]
    json.dump(report, open(os.path.join(out_dir, f"{a.procedure}-report.json"), "w"), indent=1)
    shutil.rmtree(build, ignore_errors=True)
    print(json.dumps(report, indent=1))
    if not approved:
        print("NOTE: the script is not approved by a dentist, so this is a DRAFT and must not be sent to patients.")


if __name__ == "__main__":
    main()
