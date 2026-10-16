"""Video encoding on the GPU for exports (ADR 0034).

manim encodes every animation into a partial movie with libx264 on the CPU, and the final video only
joins those (no second encode). So the encoder is swapped at that one place: `wrap_av()` (installed
by render.Recorder) makes manim's writer open the hardware encoder instead of libx264. The ffmpeg Studio installs (conda-forge,
through PyAV) has:

- h264_videotoolbox on macOS (Apple silicon and Intel),
- h264_nvenc on Windows and Linux, for NVIDIA cards,
- h264_mf on Windows: Media Foundation's hardware encoder, which AMD's (and Intel's) drivers provide.
  conda-forge's ffmpeg has no AMF, AMD's own encoder.

`detect()` tries them in that order with a few frames each; an encoder that's built in but has no
hardware behind it fails there, so the first that works is the computer's.
"""

from __future__ import annotations

import io
import sys
from fractions import Fraction

# Tried in order on each platform: the first one that encodes is used.
CANDIDATES = {
    "darwin": ["h264_videotoolbox"],
    "win32": ["h264_nvenc", "h264_mf"],
    "linux": ["h264_nvenc"],
}

LABELS = {
    "h264_videotoolbox": "Apple VideoToolbox",
    "h264_nvenc": "NVIDIA NVENC",
    "h264_mf": "Windows Media Foundation (AMD and other GPUs)",
}

# A short name for the partial-movie cache folder: pieces from different encoders are never joined,
# since one video can carry only one set of stream parameters.
SHORT = {"h264_videotoolbox": "vt", "h264_nvenc": "nvenc", "h264_mf": "mf"}


def short_name(encoder: str) -> str:
    return SHORT.get(encoder, encoder.replace("h264_", ""))


def stream_settings(encoder: str, width: int, height: int, fps: float) -> tuple[dict[str, str], str | None, int | None]:
    """The encoder's options, the pixel format it needs (None: manim's yuv420p), and a bit rate (None: quality mode).

    The quality is about libx264's crf 23, manim's own setting: NVENC in its constant-quality mode, the
    others at about 0.08 bits per pixel (5 Mbit/s at 1080p30), plenty for flat colours and text."""
    rate = max(1_500_000, int(width * height * fps * 0.08))
    if encoder == "h264_nvenc":
        return {"preset": "p5", "tune": "hq", "rc": "vbr", "cq": "23", "b": "0", "profile": "high"}, None, None
    if encoder == "h264_videotoolbox":
        return {"realtime": "0", "allow_sw": "0", "profile": "high"}, None, rate
    if encoder == "h264_mf":
        return {"hw_encoding": "1", "rate_control": "pc_vbr", "scenario": "archive"}, "nv12", rate
    return {}, None, rate  # anything else (the tests use ffmpeg's own mpeg4)


def probe(encoder: str) -> str | None:
    """Encodes a few frames in memory; None if it worked, else what went wrong."""
    import av
    import numpy as np

    width, height, fps = 640, 360, 30
    try:
        out = av.open(io.BytesIO(), mode="w", format="mp4")
        options, pix_fmt, rate = stream_settings(encoder, width, height, fps)
        stream = out.add_stream(encoder, rate=fps, options=options)
        stream.width, stream.height = width, height
        stream.pix_fmt = pix_fmt or "yuv420p"
        if rate:
            stream.bit_rate = rate
        packets = 0
        for i in range(12):
            img = np.zeros((height, width, 4), dtype=np.uint8)
            img[:, : (i + 1) * 40] = (255, 200, 80, 255)
            frame = av.VideoFrame.from_ndarray(img, format="rgba")
            for packet in stream.encode(frame):
                out.mux(packet)
                packets += 1
        for packet in stream.encode():
            out.mux(packet)
            packets += 1
        out.close()
        return None if packets else "it produced no video"
    except Exception as e:  # noqa: BLE001 - any failure means "not on this computer"
        return f"{type(e).__name__}: {e}"


def detect() -> dict:
    """The first encoder that works here, and what each one tried said."""
    import av

    tried = []
    for name in CANDIDATES.get(sys.platform if sys.platform != "linux2" else "linux", []):
        if name not in av.codecs_available:
            tried.append({"encoder": name, "error": "not in this ffmpeg"})
            continue
        error = probe(name)
        tried.append({"encoder": name, "error": error})
        if error is None:
            return {"encoder": name, "label": LABELS.get(name, name), "short": short_name(name), "tried": tried}
    return {"encoder": None, "tried": tried}


class _Stream:
    """manim's stream, but the pixel format stays the one the encoder needs (manim sets yuv420p)."""

    __slots__ = ("_s", "_pix_fmt")

    def __init__(self, stream, pix_fmt: str | None):
        object.__setattr__(self, "_s", stream)
        object.__setattr__(self, "_pix_fmt", pix_fmt)

    def __getattr__(self, name):
        return getattr(self._s, name)

    def __setattr__(self, name, value):
        setattr(self._s, name, self._pix_fmt if name == "pix_fmt" and self._pix_fmt else value)


class _Container:
    """An output container whose libx264 stream is opened with `encoder` instead."""

    def __init__(self, container, encoder: str):
        self._c = container
        self._encoder = encoder

    def __getattr__(self, name):
        return getattr(self._c, name)

    def __enter__(self):
        self._c.__enter__()
        return self

    def __exit__(self, *exc):
        return self._c.__exit__(*exc)

    def add_stream(self, codec_name=None, rate=None, options=None, **kwargs):
        if codec_name != "libx264":
            return self._c.add_stream(codec_name, rate=rate, options=options, **kwargs)
        from manim import config

        fps = float(rate) if isinstance(rate, (int, float, Fraction)) else float(config.frame_rate)
        hw_options, pix_fmt, bit_rate = stream_settings(self._encoder, config.pixel_width, config.pixel_height, fps)
        kept = {k: v for k, v in (options or {}).items() if k == "an"}  # crf is libx264's own
        stream = self._c.add_stream(self._encoder, rate=rate, options={**kept, **hw_options}, **kwargs)
        if bit_rate:
            stream.bit_rate = bit_rate
        return _Stream(stream, pix_fmt)


class _Av:
    """PyAV as manim's writer sees it: the same module, with av.open giving the encoder's containers."""

    def __init__(self, av, encoder: str):
        self._av = av
        self._encoder = encoder

    def __getattr__(self, name):
        return getattr(self._av, name)

    def open(self, file, mode="r", *args, **kwargs):
        container = self._av.open(file, mode, *args, **kwargs)
        return _Container(container, self._encoder) if mode == "w" else container


def wrap_av(av, encoder: str) -> _Av:
    """PyAV for manim's writer, encoding partial movies with `encoder` (render.Recorder installs it)."""
    return _Av(av._av if isinstance(av, _Av) else av, encoder)
