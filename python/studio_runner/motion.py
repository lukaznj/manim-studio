"""Encode deterministic browser frames into ordinary, silent VideoClip media."""
from pathlib import Path
from uuid import uuid4

import av
from PIL import Image


def encode(frames: Path, output: Path, fps: int = 24) -> dict:
    files = sorted(frames.glob("[0-9][0-9][0-9][0-9].png"))
    if not 1 <= fps <= 30 or not 1 <= len(files) <= 360:
        raise ValueError("Motion needs 1–360 frames and 1–30 fps.")
    if [p.name for p in files] != [f"{i:04}.png" for i in range(len(files))]:
        raise ValueError("Motion frames must be contiguous, starting at 0000.png.")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f"{output.stem}.{uuid4().hex}.partial.mp4")
    try:
        with Image.open(files[0]) as first:
            width, height = first.size
        if width % 2 or height % 2 or min(width, height) < 2 or max(width, height) > 1920:
            raise ValueError("Motion dimensions must be even and at most 1920 pixels.")
        with av.open(str(temporary), "w") as container:
            stream = container.add_stream("libx264", rate=fps)
            stream.width, stream.height, stream.pix_fmt = width, height, "yuv420p"
            stream.options = {"crf": "18", "preset": "fast"}
            for i, path in enumerate(files):
                with Image.open(path) as image:
                    if image.size != (width, height):
                        raise ValueError("Every motion frame must have the same size.")
                    frame = av.VideoFrame.from_image(image.convert("RGB"))
                frame.pts = i
                container.mux(stream.encode(frame))
            container.mux(stream.encode())
        temporary.replace(output)
        return {"path": str(output), "frames": len(files), "seconds": len(files) / fps, "width": width, "height": height}
    finally:
        temporary.unlink(missing_ok=True)
