"""Word start times for a human recording (runs in the optional `transcribe` env).

Whisper's words rarely match the script one-to-one (numbers, fillers, splits), so the
transcript is aligned to the script with difflib; unmatched script words are
interpolated between their matched neighbours."""

from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

WORD = re.compile(r"\S+")


def _norm(word: str) -> str:
    return re.sub(r"[^\w]", "", word.lower())


def match_starts(script_words: list[str], heard: list[tuple[str, float]], duration: float) -> list[float]:
    a = [_norm(w) for w in script_words]
    b = [_norm(w) for w, _ in heard]
    starts: list[float | None] = [None] * len(a)
    for block in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            starts[block.a + k] = heard[block.b + k][1]
    # Interpolate the gaps; anchor the ends at 0 and the audio's end.
    known = [(-1, 0.0)] + [(i, t) for i, t in enumerate(starts) if t is not None] + [(len(a), duration)]
    for (i0, t0), (i1, t1) in zip(known, known[1:]):
        for i in range(i0 + 1, i1):
            starts[i] = t0 + (t1 - t0) * (i - i0) / (i1 - i0)
    return [float(t) for t in starts]


def align(audio: str, text: str, out: str, model_size: str = "small", language: str | None = None) -> None:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="auto", compute_type="int8")
    segments, info = model.transcribe(audio, language=language, word_timestamps=True)
    heard = [(w.word.strip(), w.start) for s in segments for w in (s.words or [])]
    starts = match_starts(WORD.findall(text), heard, info.duration)
    Path(out).write_text(json.dumps({"starts": starts}))
