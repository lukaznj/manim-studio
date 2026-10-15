"""Frames (for Claude to look at, and thumbnails) and subtitle files."""

from __future__ import annotations

from pathlib import Path


def _grab(container, stream, t: float):
    """The frame showing at time t (the last one, past the end)."""
    container.seek(max(int(t / stream.time_base), 0), stream=stream, backward=True)
    chosen = None
    for f in container.decode(stream):
        chosen = f
        if f.time is not None and f.time >= t - 1e-3:
            break
    if chosen is None:
        raise RuntimeError(f"no frame at {t}s")
    return chosen.to_image()


def _fit(image, width: int | None):
    if width and image.width > width:
        return image.resize((width, round(image.height * width / image.width)))
    return image


def frame(video: str, t: float, out: str, width: int | None = None) -> None:
    frames(video, [t], [out], width)


def frames(video: str, times: list[float], outs: list[str], width: int | None = None) -> None:
    """Several frames from one open container, written to the given paths in order."""
    import av

    with av.open(video) as container:
        stream = container.streams.video[0]
        for t, out in zip(times, outs):
            _fit(_grab(container, stream, t), width).save(out)


def thumbnail(timeline: dict, out: str, width: int) -> float:
    """Saves the most "contentful" frame among a few candidates and returns its time.

    Candidates are section ends (past the title) and late points in the video, where diagrams
    are most complete; the score is pixel variation, which an empty background doesn't have."""
    import av
    from PIL import ImageStat

    d = timeline["duration"]
    if timeline.get("thumbnail"):  # the scene marked the moment showing its core idea
        from .card import concept_time

        t = concept_time(timeline)
        with av.open(timeline["video"]) as container:
            _fit(_grab(container, container.streams.video[0], t), width).convert("RGB").save(out, quality=88)
        return t
    times = sorted({round(min(max(t, 0), d - 0.05), 2) for t in
                    [s["end"] - 0.05 for s in (timeline["sections"][1:] or timeline["sections"]) if s["end"] > s["start"]]
                    + [d * 0.5, d * 0.75, d - 0.05]})
    best, best_score, best_t = None, -1.0, 0.0
    with av.open(timeline["video"]) as container:
        stream = container.streams.video[0]
        for t in times:
            try:
                image = _grab(container, stream, t)
            except RuntimeError:
                continue
            score = sum(ImageStat.Stat(image.convert("L").resize((160, 160))).stddev)
            if score > best_score:
                best, best_score, best_t = image, score, t
    if best is None:
        raise RuntimeError("no frames to choose a thumbnail from")
    _fit(best, width).convert("RGB").save(out, quality=88)
    return best_t


def _stamp(seconds: float, sep: str) -> str:
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def write_subtitles(subtitles: list[dict], vtt: Path, srt: Path) -> None:
    cues = [(s["start"], s["end"], s["text"]) for s in subtitles]
    vtt.write_text(
        "WEBVTT\n\n" + "".join(f"{_stamp(a, '.')} --> {_stamp(b, '.')}\n{t}\n\n" for a, b, t in cues),
        encoding="utf-8",
    )
    srt.write_text(
        "".join(f"{i}\n{_stamp(a, ',')} --> {_stamp(b, ',')}\n{t}\n\n" for i, (a, b, t) in enumerate(cues, 1)),
        encoding="utf-8",
    )
