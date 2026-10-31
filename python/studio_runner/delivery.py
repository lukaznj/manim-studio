"""Fit an exported picture to a delivery shape without changing the scene or its narration."""

from pathlib import Path
import shutil
import subprocess


def fit_video(video: Path, out: Path, aspect: str) -> dict:
    import av
    from .card import _colours

    if aspect not in ("16:9", "9:16"):
        raise ValueError("Unsupported delivery aspect ratio")
    if video.resolve() == out.resolve():
        raise ValueError("Delivery needs a separate output file")
    with av.open(str(video)) as container:
        stream = container.streams.video[0]
        source_width, source_height = stream.width, stream.height
        frame = next(container.decode(video=0)).to_image().convert("RGB")
    short = min(source_width, source_height)
    long = round(short * 16 / 9 / 2) * 2
    width, height = (short, long) if aspect == "9:16" else (long, short)
    out.parent.mkdir(parents=True, exist_ok=True)
    if (source_width, source_height) == (width, height):
        shutil.copyfile(video, out)
    else:
        background, _, _ = _colours(frame)
        colour = "0x" + "".join(f"{channel:02x}" for channel in background)
        filters = f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={colour},setsar=1"
        result = subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video),
            "-map", "0:v:0", "-map", "0:a?", "-vf", filters, "-c:v", "libx264", "-crf", "18",
            "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(out),
        ], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(f"Video formatting failed: {result.stderr[-1500:]}")
    return {"width": width, "height": height}
