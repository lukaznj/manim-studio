"""Burn subtitles into a copy of an exported video (Save video, ADR 0062).

The .srt becomes an ASS script at the video's own resolution, styled like the viewer's
subtitle preference (size, colours, box opacity, outline, top or bottom), and placed
inside the band projects keep clear for subtitles (ADR 0027). ffmpeg (libass) draws it.
"""

import re
import subprocess
from pathlib import Path

from .events import emit

TIME = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{1,3})")


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


def ass_time(t: float) -> str:
    cs = round(t * 100)
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def ass_colour(hex_colour: str, opacity: int = 100) -> str:
    """#rrggbb and an opacity (0–100) as ASS's &HAABBGGRR, where alpha 00 is opaque."""
    r, g, b = hex_colour[1:3], hex_colour[3:5], hex_colour[5:7]
    alpha = round((100 - opacity) * 255 / 100)
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def to_ass(cues: list[tuple[float, float, str]], width: int, height: int, style: dict, band: bool) -> str:
    portrait = height > width
    size = max(12, round(height * (0.026 if portrait else 0.046) * style.get("size", 100) / 100))
    # Inside the band kept clear for subtitles: the bottom 14% of a landscape frame, 18% of a
    # portrait one (also clear of the apps' buttons on the right). Older projects have no band.
    band_height = height * (2.6 / 14.2 if portrait else 1.1 / 8) if band else height * 0.1
    edge = max(round(height * 0.02), round((band_height - size * 1.3) / 2))
    top = style.get("position") == "top"
    boxed = style.get("opacity", 70) > 0
    text = style.get("color", "#ffffff")
    light = sum(int(text[i:i + 2], 16) * w for i, w in ((1, 0.2126), (3, 0.7152), (5, 0.0722))) >= 128
    # Box style draws an opaque box in OutlineColour; otherwise OutlineColour is the text's outline.
    outline_colour = ass_colour(style.get("background", "#000000"), style.get("opacity", 70)) if boxed else ass_colour("#000000" if light else "#ffffff")
    outline = round(size * 0.22) if boxed else (max(1, round(size * 0.07)) if style.get("outline", True) else 0)
    margin_r = round(width * 0.9 / 8) if portrait and band else round(width * 0.06)
    header = "\n".join([
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,Inter,{size},{ass_colour(text)},{ass_colour(text)},{outline_colour},&H00000000,0,0,0,0,100,100,0,0,"
        f"{3 if boxed else 1},{outline},0,{8 if top else 2},{round(width * 0.06)},{margin_r},{edge},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])
    events = [
        f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{body.replace(chr(92), chr(92) + chr(8203)).replace('{', '(').replace('}', ')').replace(chr(10), chr(92) + 'N')}"
        for start, end, body in cues
    ]
    return header + "\n" + "\n".join(events) + "\n"


def burn(video: Path, srt: Path, out: Path, style: dict, band: bool) -> dict:
    import av

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
    script = out.with_name(out.stem + ".subtitles.ass")
    script.write_text(to_ass(cues, width, height, style, band), encoding="utf-8")
    try:
        # Run beside the script so its name needs no filter escaping (drive letters, colons).
        child = subprocess.Popen([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video.resolve()),
            "-map", "0:v:0", "-map", "0:a?", "-vf", f"ass={script.name}", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
            "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", str(out.resolve()),
        ], cwd=script.parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for line in child.stdout:
            if line.startswith("out_time_us=") and duration:
                try:
                    emit("progress", percent=min(1.0, int(line.split("=", 1)[1]) / 1e6 / duration))
                except ValueError:
                    pass
        error = child.stderr.read()
        if child.wait():
            raise RuntimeError(f"Burning in the subtitles failed: {error[-1500:]}")
    finally:
        script.unlink(missing_ok=True)
    return {"width": width, "height": height, "lines": len(cues)}
