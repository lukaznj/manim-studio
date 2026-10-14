"""Dubbing: another language's narration as an audio track for the same video, plus its subtitles.

Each voiceover block's translation is voiced with the project's provider in the target language and
placed where the original block starts. When it runs longer than the time before the next block it
is sped up (pitch kept, at most MAX_SPEEDUP), so the picture stays in sync. Two sentences never talk
over each other: one still too long pushes the next back a little, and the pauses after it absorb
the delay. That is what YouTube's extra audio tracks need: one video, several languages. Writes <base>.<lang>.m4a/.srt/.vtt and, for
each --video, <video>.<lang>.mp4 with this track instead of the original one."""

import json
import math
import os
import re
from fractions import Fraction
from pathlib import Path

import av
import numpy as np

from studio import voice
from studio.voice import StudioSpeech, spoken, text_key

from .events import emit
from .media import write_subtitles

RATE = 48000
MAX_SPEEDUP = 1.6
GAP = 0.15  # silence kept between two sentences pushed together
LATE = 0.5  # warn when a sentence starts this much after its picture
CUE_CHARS = 70  # the same subtitle length as the original language's


def dub(timeline_path: Path, translations_path: Path, lang: str, out_base: Path, videos: list[Path]) -> dict:
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    translations: dict[str, str] = json.loads(translations_path.read_text(encoding="utf-8"))
    project = timeline_path.resolve().parents[2]  # <project>/.studio/<render>/timeline.json
    settings = {**json.loads(os.environ.get("STUDIO_VOICE", "{}") or "{}"), "language": lang}
    speech = StudioSpeech(project / "voice", settings)

    duration = float(timeline["duration"])
    track = np.zeros(int(math.ceil((duration + 30) * RATE)), np.float32)  # room to run late; trimmed below
    cues: list[dict] = []
    warnings: list[str] = []
    blocks = timeline["voice"]
    cursor = 0.0  # where the previous sentence ended
    for i, block in enumerate(blocks):
        text = translations.get(block["text"], "").strip()
        if not text:
            warnings.append(f'No translation for “{block["text"][:50]}”')
            continue
        voice.WARNINGS.clear()
        rel, _, source = speech._audio_for(spoken(text), text_key(text))
        warnings += voice.WARNINGS
        audio = _load(project / "voice" / rel)
        at = max(block["start"], cursor)
        slot = max(0.2, (blocks[i + 1]["start"] if i + 1 < len(blocks) else duration) - at)
        needed = len(audio) / RATE / slot
        if needed > 1:
            audio = _stretch(audio, min(needed, MAX_SPEEDUP))
        if at - block["start"] > LATE:
            warnings.append(f"“{text[:50]}” starts {at - block['start']:.1f} s after its picture: the sentence before it is long")
        start = int(at * RATE)
        end = min(len(track), start + len(audio))
        track[start:end] += audio[: end - start]
        cues += _cues(text, at, end / RATE)
        cursor = end / RATE + GAP
        emit("progress", done=i + 1, total=len(blocks), source=source)

    track = track[: int(math.ceil(max(duration, cursor - GAP) * RATE))]
    np.clip(track, -1, 1, out=track)
    base = f"{out_base}.{lang}"
    files = [f"{base}.m4a", f"{base}.srt", f"{base}.vtt"]
    with av.open(files[0], "w", format="ipod") as out:
        _encode(out, _audio_stream(out), track)
    write_subtitles(cues, Path(files[2]), Path(files[1]))
    for video in videos:
        target = str(video.with_suffix(f".{lang}.mp4"))
        _mux(video, track, target)
        files.append(target)
    return {"files": files, "warnings": warnings}


def _load(path: Path) -> np.ndarray:
    """Any audio file as mono float32 samples at RATE."""
    resampler = av.AudioResampler(format="flt", layout="mono", rate=RATE)
    chunks: list[np.ndarray] = []
    with av.open(str(path)) as container:
        for frame in container.decode(audio=0):
            chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(frame)]
    chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    return np.concatenate(chunks) if chunks else np.zeros(0, np.float32)


def _stretch(samples: np.ndarray, factor: float) -> np.ndarray:
    """Faster by `factor`, same pitch (ffmpeg's atempo)."""
    graph = av.filter.Graph()
    source = graph.add_abuffer(sample_rate=RATE, format="flt", layout="mono", time_base=Fraction(1, RATE))
    tempo = graph.add("atempo", f"{factor:.4f}")
    sink = graph.add("abuffersink")
    source.link_to(tempo)
    tempo.link_to(sink)
    graph.configure()
    frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format="flt", layout="mono")
    frame.sample_rate = RATE
    frame.time_base = Fraction(1, RATE)
    frame.pts = 0
    graph.push(frame)
    graph.push(None)
    out: list[np.ndarray] = []
    while True:
        try:
            out.append(graph.pull().to_ndarray().reshape(-1))
        except (av.error.BlockingIOError, av.error.EOFError):
            break
    return np.concatenate(out) if out else samples


def _audio_stream(container):
    stream = container.add_stream("aac", rate=RATE, layout="mono")
    stream.bit_rate = 160_000
    return stream


def _encode(container, stream, samples: np.ndarray) -> None:
    frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format="flt", layout="mono")
    frame.sample_rate = RATE
    for packet in stream.encode(frame):
        container.mux(packet)
    for packet in stream.encode(None):
        container.mux(packet)


def _mux(video: Path, samples: np.ndarray, target: str) -> None:
    """The video's picture, untouched, with this audio."""
    with av.open(str(video)) as source, av.open(target, "w") as out:
        picture = source.streams.video[0]
        copy = out.add_stream_from_template(picture)
        sound = _audio_stream(out)  # every stream before the first packet: MP4 writes its header then
        for packet in source.demux(picture):
            if packet.dts is None:
                continue
            packet.stream = copy
            out.mux(packet)
        _encode(out, sound, samples)


def _cues(text: str, start: float, end: float) -> list[dict]:
    """The text in subtitle-sized pieces, each shown for its share of the speech."""
    pieces: list[str] = []
    for word in re.findall(r"\S+", text):
        if pieces and len(pieces[-1]) + 1 + len(word) <= CUE_CHARS:
            pieces[-1] += " " + word
        else:
            pieces.append(word)
    total = sum(len(p) for p in pieces) or 1
    cues, t = [], start
    for piece in pieces:
        span = (end - start) * len(piece) / total
        cues.append({"start": round(t, 3), "end": round(t + span, 3), "text": piece})
        t += span
    return cues
