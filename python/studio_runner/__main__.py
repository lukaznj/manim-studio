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

    sub.add_parser("check")
    sub.add_parser("tts-worker")

    args = p.parse_args(argv)

    if args.cmd == "render":
        from .render import render

        return render(args.project, args.quality, size=args.size, fps=args.fps, theme=args.theme, out_name=args.out)

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

    if args.cmd == "align":
        from .align import align

        align(args.audio, args.text, args.out, args.model, (args.language or "").split("-")[0] or None)
        emit("done", path=args.out)
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
