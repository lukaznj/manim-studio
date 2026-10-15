"""The exported thumbnail: the video's key picture with a hook, its number and its series.

The scene marks the moment that shows its core idea with `self.thumbnail("hook")`; without a
mark, the end of its longest middle section. The picture is zoomed a little and moved right,
so the text on the left (below, in portrait) never covers it."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .media import _grab

FONT = Path(__file__).resolve().parent.parent / "studio" / "fonts" / "Nunito[wght].ttf"
SUN = (255, 209, 102)
INK = (22, 24, 29)
PAPER = (242, 245, 249)
BLUE = (47, 109, 246)


def _colours(frame: Image.Image) -> tuple[tuple, tuple, tuple]:
    """Background, text and accent from the frame itself: its edges are the video's background,
    which may be a custom colour or picture rather than the theme's."""
    small = frame.resize((64, 36) if frame.width > frame.height else (36, 64))
    edge = [small.getpixel((x, y)) for x in range(small.width) for y in range(small.height) if x in (0, small.width - 1) or y in (0, small.height - 1)]
    bg = tuple(sorted(c[i] for c in edge)[len(edge) // 2] for i in range(3))
    light = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] > 140
    return bg, (INK if light else PAPER), (BLUE if light else SUN)


def concept_time(timeline: dict) -> float:
    """The marked moment, else the end of the longest section after the first (not the title)."""
    d = timeline["duration"]
    mark = timeline.get("thumbnail")
    if mark:
        return min(max(mark["t"] - 0.04, 0), d - 0.05)  # the picture the last animation finished on
    sections = [s for s in timeline["sections"][1:] if s["end"] > s["start"]] or [s for s in timeline["sections"] if s["end"] > s["start"]]
    if sections:
        s = max(sections, key=lambda s: s["end"] - s["start"])
        return max(min(s["end"] - 0.3, d - 0.05), 0)
    return d * 0.6


def _font(size: int, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_name(weight)
    return f


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    lines: list[str] = []
    for word in text.split():
        if lines and draw.textlength(f"{lines[-1]} {word}", font=font) <= width:
            lines[-1] += f" {word}"
        else:
            lines.append(word)
    return lines


def _fit_text(draw, text: str, width: int, height: int, sizes: range, max_lines: int):
    """The biggest size at which `text` wraps into `max_lines` lines inside width x height."""
    for size in sizes:
        font = _font(size, "Black")
        lines = _wrap(draw, text, font, width)
        if len(lines) <= max_lines and all(draw.textlength(l, font=font) <= width for l in lines) and len(lines) * size * 1.08 <= height:
            return font, lines, size
    font = _font(sizes[-1], "Black")
    return font, _wrap(draw, text, font, width)[:max_lines], sizes[-1]


def card(timeline: dict, out: str, *, text: str, badge: str = "", kicker: str = "") -> float:
    """Writes the thumbnail to `out` (JPEG) and returns the time of the frame it shows."""
    import av

    t = concept_time(timeline)
    with av.open(timeline["video"]) as container:
        frame = _grab(container, container.streams.video[0], t).convert("RGB")
    portrait = frame.height > frame.width
    W, H = (720, 1280) if portrait else (1280, 720)
    bg, fg, accent = _colours(frame)
    canvas = Image.new("RGB", (W, H), bg)

    # The picture, a little bigger than the frame, centred right of the text (below it, upright).
    zoom = 1.05
    scale = max(W / frame.width, H / frame.height) * zoom
    pic = frame.resize((round(frame.width * scale), round(frame.height * scale)), Image.LANCZOS)
    cx, cy = (W * 0.5, H * 0.4) if portrait else (W * 0.68, H * 0.5)
    canvas.paste(pic, (round(cx - pic.width / 2), round(cy - pic.height / 2)))

    draw = ImageDraw.Draw(canvas)

    pad = round(W * 0.045) if not portrait else 44
    # The number: a chalk-yellow tag, top left.
    if badge:
        bf = _font(round(H * (0.105 if not portrait else 0.06)), "Black")
        l, tp, r, b = draw.textbbox((0, 0), badge, font=bf)
        bw, bh = r - l + 2 * round(bf.size * 0.32), b - tp + 2 * round(bf.size * 0.2)
        draw.rounded_rectangle([pad, pad, pad + bw, pad + bh], radius=round(bh * 0.22), fill=SUN)
        draw.text((pad + (bw - (r - l)) / 2 - l, pad + (bh - (b - tp)) / 2 - tp), badge, font=bf, fill=INK)

    # The hook, as big as it fits, with the series' name above it and a yellow rule below.
    text_w = round(W * 0.44) if not portrait else W - 2 * pad
    area_h = round(H * 0.5) if not portrait else round(H * 0.3)
    font, lines, size = _fit_text(draw, text.strip(), text_w, area_h, range(round(H * 0.17), round(H * 0.06), -4) if not portrait else range(110, 48, -4), 3 if not portrait else 4)
    block_h = round(len(lines) * size * 1.08)
    kf = _font(round(size * 0.36), "ExtraBold") if kicker else None
    kick_h = round(kf.size * 1.5) if kf else 0
    top = (H - pad - round(size * 0.35) - block_h - kick_h) if portrait else round((H - block_h - kick_h) / 2 + H * 0.05)
    if kf:
        k = kicker.upper()
        while draw.textlength(k, font=kf) > text_w and len(k) > 4:
            k = k[:-2].rstrip(" …") + "…"
        draw.text((pad, top), k, font=kf, fill=accent)
    y = top + kick_h
    for line in lines:
        draw.text((pad, y), line, font=font, fill=fg, stroke_width=max(2, size // 28), stroke_fill=bg)
        y += round(size * 1.08)
    draw.rounded_rectangle([pad, y + round(size * 0.12), pad + round(size * 1.6), y + round(size * 0.12) + max(6, size // 11)], radius=4, fill=SUN)

    canvas.save(out, quality=90)
    return t
