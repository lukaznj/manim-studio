"""python -m studio_runner <command> — everything the app asks Python to do."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from .events import emit


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="studio_runner")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("render")
    r.add_argument("project", type=Path)
    r.add_argument("--quality", choices=["preview", "final"], default="preview")
    r.add_argument("--size", type=int, help="short side in pixels (preview: 480 by default)")
    r.add_argument("--fps", type=int)
    r.add_argument("--theme", choices=["dark", "light"], help="instead of the project's (for exporting both)")
    r.add_argument("--out", help="output folder under .studio/ (default: the quality)")
    # A slice of a parallel export (src/main/export.ts): only these animations are drawn, into the cache.
    r.add_argument("--from", dest="from_anim", type=int, help="first animation to draw (0-based)")
    r.add_argument("--upto", type=int, help="last animation to draw, inclusive")
    r.add_argument("--voice-only", action="store_true", help="make the narration, draw nothing (before a remote export)")

    f = sub.add_parser("frame")
    f.add_argument("video")
    f.add_argument("t", type=float)
    f.add_argument("out")
    f.add_argument("--width", type=int)

    fs = sub.add_parser("frames")
    fs.add_argument("video")
    fs.add_argument("out_dir", type=Path)
    fs.add_argument("--times", required=True, help="comma-separated seconds")
    fs.add_argument("--width", type=int)

    e = sub.add_parser("export")
    e.add_argument("timeline", type=Path)
    e.add_argument("dest", type=Path)

    th = sub.add_parser("thumbnail")
    th.add_argument("timeline", type=Path)
    th.add_argument("out")
    th.add_argument("--width", type=int, default=480)

    a = sub.add_parser("align")
    a.add_argument("audio")
    a.add_argument("text")
    a.add_argument("out")
    a.add_argument("--model", default="small")
    a.add_argument("--language", default=None, help="BCP 47 code; None lets Whisper detect it")

    d = sub.add_parser("dub")
    d.add_argument("timeline", type=Path)
    d.add_argument("translations", type=Path, help="JSON: original narration text -> translation")
    d.add_argument("lang")
    d.add_argument("out_base", type=Path, help="files become <out_base>.<lang>.m4a/.srt/.vtt")
    d.add_argument("--video", type=Path, action="append", default=[], help="also write <video>.<lang>.mp4")

    pi = sub.add_parser("pdf-index")
    pi.add_argument("pdf", type=Path)
    pi.add_argument("out_dir", type=Path)

    pp = sub.add_parser("pdf-pages")
    pp.add_argument("pdf", type=Path)
    pp.add_argument("out_dir", type=Path)
    pp.add_argument("--pages", required=True, help="comma-separated, 1-based")
    pp.add_argument("--width", type=int, default=800)

    sub.add_parser("check")
    sub.add_parser("tts-worker")

    tc = sub.add_parser("thumbnail-card")
    tc.add_argument("timeline", type=Path)
    tc.add_argument("out")
    tc.add_argument("--text", required=True, help="the hook when the scene marks none")
    tc.add_argument("--badge", default="")
    tc.add_argument("--kicker", default="")

    j = sub.add_parser("concat")
    j.add_argument("out", type=Path)
    j.add_argument("videos", type=Path, nargs="+")

    args = p.parse_args(argv)

    if args.cmd == "render":
        from .render import render

        return render(args.project, args.quality, size=args.size, fps=args.fps, theme=args.theme, out_name=args.out, from_anim=args.from_anim, upto=args.upto, voice_only=args.voice_only)

    if args.cmd == "dub":
        from .dub import dub

        try:
            emit("done", **dub(args.timeline, args.translations, args.lang, args.out_base, args.video))
        except Exception as e:  # noqa: BLE001 - tell the app what broke, not just an exit code
            emit("error", message=f"{type(e).__name__}: {e}")
            return 1
        return 0

    if args.cmd == "frame":
        from .media import frame

        frame(args.video, args.t, args.out, args.width)
        emit("done", path=args.out)
        return 0

    if args.cmd == "frames":
        from .media import frames

        times = [float(t) for t in args.times.split(",")]
        args.out_dir.mkdir(parents=True, exist_ok=True)
        outs = [str(args.out_dir / f"frame-{i}.png") for i in range(len(times))]
        frames(args.video, times, outs, args.width)
        emit("done", paths=outs)
        return 0

    if args.cmd == "thumbnail":
        from .media import thumbnail

        t = thumbnail(json.loads(args.timeline.read_text(encoding="utf-8")), args.out, args.width)
        emit("done", path=args.out, t=t)
        return 0

    if args.cmd == "export":
        return export(args.timeline, args.dest)

    if args.cmd == "thumbnail-card":
        from .card import card

        timeline = json.loads(args.timeline.read_text(encoding="utf-8"))
        text = (timeline.get("thumbnail") or {}).get("text") or args.text
        t = card(timeline, args.out, text=text, badge=args.badge, kicker=args.kicker)
        emit("done", path=args.out, t=t)
        return 0

    if args.cmd == "concat":
        from .concat import concat

        try:
            emit("done", durations=concat(args.out, args.videos))
        except Exception as e:  # noqa: BLE001 - videos that don't fit together are reported, not a traceback
            emit("error", message=f"{type(e).__name__}: {e}")
            return 1
        return 0

    if args.cmd == "align":
        from .align import align

        align(args.audio, args.text, args.out, args.model, (args.language or "").split("-")[0] or None)
        emit("done", path=args.out)
        return 0

    if args.cmd in ("pdf-index", "pdf-pages"):
        from . import sources

        try:
            if args.cmd == "pdf-index":
                emit("done", info=sources.index(args.pdf, args.out_dir))
            else:
                emit("done", paths=sources.pages(args.pdf, args.out_dir, [int(n) for n in args.pages.split(",")], args.width))
        except Exception as e:  # noqa: BLE001 - a damaged or encrypted PDF is reported, not a traceback
            emit("error", message=f"{type(e).__name__}: {e}")
            return 1
        return 0

    if args.cmd == "check":
        return check()

    if args.cmd == "tts-worker":
        from .worker import serve

        serve()
        return 0
    return 2


def export(timeline: Path, dest: Path) -> int:
    """Copy a final render to dest/<name>.mp4 with .vtt/.srt subtitles and a thumbnail."""
    from .media import thumbnail, write_subtitles

    result = json.loads(timeline.read_text(encoding="utf-8"))
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Appended, not with_suffix(): "name.dark" must become "name.dark.mp4", not "name.mp4".
    at = lambda ext: dest.parent / f"{dest.name}{ext}"  # noqa: E731
    video = at(".mp4")
    shutil.copyfile(result["video"], video)
    write_subtitles(result["subtitles"], at(".vtt"), at(".srt"))
    thumbnail({**result, "video": str(video)}, str(at(".jpg")), width=1280)
    emit("done", video=str(video))
    return 0


def check() -> int:
    import platform

    info: dict = {"python": sys.version.split()[0], "platform": platform.platform()}
    try:
        import manim
        import manim_voiceover  # noqa: F401

        info["manim"] = manim.__version__
    except Exception as e:  # noqa: BLE001
        info["manimError"] = str(e)
    info["latex"] = shutil.which("latex")
    info["dvisvgm"] = shutil.which("dvisvgm")
    emit("done", info=info)
    return 0


if __name__ == "__main__":
    sys.exit(main())
