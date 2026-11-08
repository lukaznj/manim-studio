"""Burn subtitles into a copy of an exported video (Save video, ADR 0062).

Each cue is drawn into a transparent picture the size of the frame, styled like the viewer's
subtitle preference (size, colours, box opacity, outline, top or bottom) and placed inside the
band projects keep clear for subtitles (ADR 0027). ffmpeg's built-in overlay filter lays them
over the video at their times. (Not libass: conda-forge's Windows ffmpeg is built without it.)
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

from .events import emit

TIME = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{1,3})")
FONT = Path(__file__).resolve().parents[1] / "studio" / "fonts" / "Nunito[wght].ttf"
# Greek letters, maths symbols and subscripts (τ ≪ Tₚ) come from DejaVu Sans, which the environment ships.
FALLBACKS = [Path(sys.prefix) / "fonts" / "DejaVuSans.ttf", Path(sys.prefix) / "Library" / "fonts" / "DejaVuSans.ttf"]


def parse_srt(text: str) -> list[tuple[float, float, str]]:
    cues = []
    for block in re.split(r"\r?\n[ \t]*\r?\n", text.strip()):
        lines = block.strip().splitlines()
        at = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if at is None:
            continue
        times = TIME.findall(lines[at])
        if len(times) < 2:
            continue
        start, end = (int(h) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000 for h, m, s, ms in times[:2])
        body = "\n".join(lines[at + 1:]).strip()
        if body and end > start:
            cues.append((start, end, body))
    return cues


def _rgba(hex_colour: str, opacity: int = 100) -> tuple[int, int, int, int]:
    return (int(hex_colour[1:3], 16), int(hex_colour[3:5], 16), int(hex_colour[5:7], 16), round(opacity * 255 / 100))


def _fonts(size: int):
    from PIL import ImageFont

    font = ImageFont.truetype(str(FONT), size)
    try:
        font.set_variation_by_axes([600])
    except Exception:  # a font without a weight axis keeps its own
        pass
    fallback = next((ImageFont.truetype(str(f), round(size * 0.92)) for f in FALLBACKS if f.exists()), None)
    return font, fallback


def _runs(line: str, font, fallback) -> list[tuple[str, object]]:
    """The line in pieces, each in the first font that has its letters."""
    glyph = lambda ch: (font.getbbox(ch), list(font.getmask(ch)))  # noqa: E731
    missing = glyph("\U000f0000")  # what this font draws for a letter it lacks
    runs: list[tuple[str, object]] = []
    for ch in line:
        use = fallback if fallback and not ch.isspace() and glyph(ch) == missing else font
        if runs and runs[-1][1] is use:
            runs[-1] = (runs[-1][0] + ch, use)
        else:
            runs.append((ch, use))
    return runs


def cue_image(text: str, width: int, height: int, style: dict, band: bool):
    """The cue as a transparent frame-sized picture, its text wrapped to fit and placed in the band."""
    from PIL import Image, ImageDraw

    portrait = height > width
    size = max(12, round(height * (0.026 if portrait else 0.046) * style.get("size", 100) / 100))
    font, fallback = _fonts(size)
    # Inside the band kept clear for subtitles: the bottom 14% of a landscape frame, 18% of a
    # portrait one (also clear of the apps' buttons on the right). Older projects have no band.
    band_height = height * (2.6 / 14.2 if portrait else 1.1 / 8) if band else height * 0.1
    left = round(width * 0.06)
    right = width - (round(width * 0.9 / 8) if portrait and band else left)
    draw = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    measure = lambda line: sum(draw.textlength(t, font=f) for t, f in _runs(line, font, fallback))  # noqa: E731
    lines: list[str] = []
    for paragraph in text.splitlines():
        line = ""
        for word in paragraph.split():
            if line and measure(f"{line} {word}") > right - left:
                lines.append(line)
                line = word
            else:
                line = f"{line} {word}".strip()
        if line:
            lines.append(line)
    step = round(size * 1.3)
    block = step * len(lines)
    if style.get("position") == "top":
        y = max(round(height * 0.02), round((band_height - block) / 2))
    else:
        y = height - max(round(height * 0.02), round((band_height - block) / 2)) - block
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas = ImageDraw.Draw(image)
    colour = style.get("color", "#ffffff")
    boxed = style.get("opacity", 70) > 0
    light = sum(int(colour[i:i + 2], 16) * w for i, w in ((1, 0.2126), (3, 0.7152), (5, 0.0722))) >= 128
    stroke = max(1, round(size * 0.07)) if not boxed and style.get("outline", True) else 0
    centre = (left + right) / 2
    ascent, descent = font.getmetrics()
    for i, line in enumerate(lines):
        top = y + i * step
        length = measure(line)
        if boxed:
            pad = round(size * 0.3)
            canvas.rectangle((centre - length / 2 - pad, top, centre + length / 2 + pad, top + step), fill=_rgba(style.get("background", "#000000"), style.get("opacity", 70)))
        x, baseline = centre - length / 2, top + (step - ascent - descent) / 2 + ascent
        for piece, use in _runs(line, font, fallback):
            canvas.text((x, baseline), piece, font=use, anchor="ls", fill=_rgba(colour),
                        stroke_width=stroke, stroke_fill=(0, 0, 0, 255) if light else (255, 255, 255, 255))
            x += draw.textlength(piece, font=use)
    return image


def burn(video: Path, srt: Path, out: Path, style: dict, band: bool) -> dict:
    import av
    from PIL import Image

    if video.resolve() == out.resolve():
        raise ValueError("Burning subtitles needs a separate output file")
    with av.open(str(video)) as container:
        stream = container.streams.video[0]
        width, height = stream.width, stream.height
        duration = float(container.duration or 0) / av.time_base
    cues = parse_srt(srt.read_text(encoding="utf-8-sig"))
    if not cues:
        raise ValueError("The subtitle file has no lines to burn in")
    out.parent.mkdir(parents=True, exist_ok=True)
    work = out.with_name(f".{out.stem}.cues")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    try:
        # A picture per cue and a blank one between them, timed by an ffconcat list.
        Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(work / "blank.png")
        entries, at = [], 0.0
        for i, (start, end, text) in enumerate(cues):
            if start > at:
                entries.append(("blank.png", start - at))
            cue_image(text, width, height, style, band).save(work / f"{i}.png")
            entries.append((f"{i}.png", end - max(start, at)))
            at = end
        entries.append(("blank.png", max(0.04, duration - at)))
        listing = ["ffconcat version 1.0"] + [f"file '{name}'\nduration {seconds:.3f}" for name, seconds in entries] + ["file 'blank.png'"]
        (work / "cues.txt").write_text("\n".join(listing) + "\n", encoding="utf-8")
        # Run beside the list so its file names need no escaping (drive letters, spaces).
        with subprocess.Popen([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video.resolve()),
            "-f", "concat", "-safe", "0", "-i", "cues.txt",
            "-filter_complex", "[0:v][1:v]overlay=eof_action=pass:format=auto[v]", "-map", "[v]", "-map", "0:a?",
            "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy",
            "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", str(out.resolve()),
        ], cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as child:
            for line in child.stdout:
                if line.startswith("out_time_us=") and duration:
                    try:
                        emit("progress", percent=min(1.0, int(line.split("=", 1)[1]) / 1e6 / duration))
                    except ValueError:
                        pass
            error = child.stderr.read()
        if child.returncode:
            raise RuntimeError(f"Burning in the subtitles failed: {error[-1500:]}")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"width": width, "height": height, "lines": len(cues)}
