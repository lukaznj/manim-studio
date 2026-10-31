"""Speech for StudioScene.

Each `with self.voiceover(text=...)` block gets, in order of preference:
1. a human recording at voice/recordings/<key>.wav (made in the app's recording booth),
2. the project's TTS provider (ElevenLabs or local OmniVoice),
3. silence of an estimated length, if the provider fails, so a render never blocks on TTS.

`key` depends only on the spoken words (bookmarks and whitespace ignored), so moving a
bookmark never invalidates a recording. Audio lives in the project's voice/ folder and is
committed with the project: re-generating it costs money or a re-take.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

from manim_voiceover.helper import remove_bookmarks
from manim_voiceover.modify_audio import get_duration
from manim_voiceover.services.base import SpeechService
from manim_voiceover.tracker import AUDIO_OFFSET_RESOLUTION

WORD = re.compile(r"\S+")
# Rough speaking rate, only for the silent fallback.
WORDS_PER_SECOND = 2.5
# The default ElevenLabs model; the app's list (src/shared/voice.ts) starts with it.
DEFAULT_ELEVENLABS_MODEL = "eleven_v4"

# Read by the runner after the render: which source each block used, and problems.
USED: dict[str, str] = {}
WARNINGS: list[str] = []
ISSUES: list[dict] = []


def spoken(text: str) -> str:
    return " ".join(remove_bookmarks(" ".join(text.split())).split())


def text_key(text: str) -> str:
    return hashlib.sha1(spoken(text).encode("utf-8")).hexdigest()[:12]


def _sig(*parts: object) -> str:
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:6]


class StudioSpeech(SpeechService):
    def __init__(self, voice_dir: Path, settings: dict) -> None:
        # SpeechService.__init__ sets up its own cache.json and Whisper; we replace both.
        self.cache_dir = str(voice_dir)
        self.global_speed = 1.0
        self.settings = settings
        self.credit_error = None
        (voice_dir / "tts").mkdir(parents=True, exist_ok=True)
        (voice_dir / "recordings").mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_env(cls, project_dir: Path) -> "StudioSpeech":
        settings = json.loads(os.environ.get("STUDIO_VOICE", "{}") or "{}")
        return cls(project_dir / "voice", settings)

    def _wrap_generate_from_text(self, text: str, **kwargs: object) -> dict:
        text = " ".join(text.split())
        content = remove_bookmarks(text)
        key = text_key(text)
        audio, starts, source = self._audio_for(spoken(text), key)
        USED[key] = source
        duration = get_duration(Path(self.cache_dir) / audio)
        return {
            "input_text": text,
            "original_audio": audio,
            "final_audio": audio,
            "word_boundaries": _boundaries(content, starts, duration),
        }

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):  # required by the ABC
        return self._wrap_generate_from_text(text)

    def _audio_for(self, words: str, key: str) -> tuple[str, list[float] | None, str]:
        root = Path(self.cache_dir)
        recording = root / "recordings" / f"{key}.wav"
        if recording.exists():
            return f"recordings/{key}.wav", _load_starts(recording.with_suffix(".json")), "recording"

        provider = self.settings.get("provider", "elevenlabs")
        try:
            if provider == "elevenlabs":
                return (*self._elevenlabs(words, key), "elevenlabs")
            if provider == "omnivoice":
                return (*self._omnivoice(words, key), "omnivoice")
        except Exception as e:  # noqa: BLE001 - any provider failure degrades to silence
            issue = {"provider": provider, "kind": "credits" if isinstance(e, _HTTPError) and e.credits else "provider", "message": str(e)}
            if issue not in ISSUES:
                ISSUES.append(issue)
            warning = "ElevenLabs credits exhausted" if issue["kind"] == "credits" else f"{provider}: {e}"
            if warning not in WARNINGS:
                WARNINGS.append(warning)
        return (*self._silence(words, key), "silence")

    # --- providers -------------------------------------------------------------------

    def _cached(self, words: str, key: str, ext: str, *sig_parts: object):
        rel = f"tts/{key}-{_sig(*sig_parts)}{ext}"
        path = Path(self.cache_dir) / rel
        if path.exists():
            return rel, path, _load_starts(path.with_suffix(".json"))
        return rel, path, None

    def _silence(self, words: str, key: str):
        seconds = 0.4 + len(WORD.findall(words)) / WORDS_PER_SECOND
        rel, path, _ = self._cached(words, key, ".wav", "silence", round(seconds, 2))
        if not path.exists():
            with wave.open(str(path), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(22050)
                w.writeframes(b"\0\0" * int(seconds * 22050))
        return rel, _proportional_starts(words, 0.2, seconds - 0.2)

    def _elevenlabs(self, words: str, key: str):
        s = self.settings.get("elevenlabs", {})
        api_key = os.environ.get("ELEVENLABS_API_KEY", "")
        voice_id = s.get("voiceId", "")
        model_id = s.get("modelId", DEFAULT_ELEVENLABS_MODEL)
        if not voice_id:
            raise RuntimeError("no ElevenLabs voice chosen (Settings → Voice)")
        # Narration already made needs no key: a render worker (studio_worker) has none.
        rel, path, starts = self._cached(words, key, ".mp3", "elevenlabs", voice_id, model_id)
        if path.exists():
            _usage(words, model_id, cached=True)
            return rel, starts
        _offline()
        if self.credit_error:
            raise self.credit_error
        if not api_key:
            raise RuntimeError("no ElevenLabs API key (Settings → Voice)")

        # Pins the language (ISO 639-1).
        body: dict = {"text": words, "model_id": model_id, "language_code": self.settings.get("language", "en").split("-")[0]}
        try:
            data = _elevenlabs_post(voice_id, api_key, body)
        except _HTTPError as e:
            if e.credits:
                self.credit_error = e
                raise
            if e.code not in (400, 422) or "language_code" not in body:
                raise
            # A model that doesn't know the field or the language: speak without pinning it.
            body.pop("language_code")
            try:
                data = _elevenlabs_post(voice_id, api_key, body)
            except _HTTPError as retry_error:
                if retry_error.credits:
                    self.credit_error = retry_error
                raise

        path.write_bytes(base64.b64decode(data["audio_base64"]))
        starts = None
        for alignment in (data.get("alignment"), data.get("normalized_alignment")):
            chars = (alignment or {}).get("character_start_times_seconds")
            if chars and len(chars) == len(words):
                starts = [chars[m.start()] for m in WORD.finditer(words)]
                break
        _save_starts(path.with_suffix(".json"), starts)
        return rel, starts

    def _omnivoice(self, words: str, key: str):
        s = self.settings.get("omnivoice", {})
        url = os.environ.get("STUDIO_TTS_URL", "")
        ref = s.get("refAudio") or ""
        # The reference is keyed by its place in the project, so a copy of the project (an export,
        # a render worker) finds the same narration.
        project = Path(self.cache_dir).parent
        ref_key = Path(os.path.relpath(ref, project)).as_posix() if ref and Path(ref).is_relative_to(project) else ref
        rel, path, starts = self._cached(words, key, ".wav", "omnivoice", ref_key, s.get("refText", ""))
        if path.exists():
            return rel, starts
        _offline()
        if not url:
            raise RuntimeError("the local OmniVoice worker isn't running")
        payload = {"text": words, "out": str(path), "refAudio": ref, "refText": s.get("refText", "")}
        req = urllib.request.Request(
            url + "/synthesize", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=600) as r:
            json.load(r)
        return rel, None


def _offline() -> None:
    """A slice of a parallel export uses only narration that exists: several slices generating the
    same sentence at once would pay for it several times. The final pass makes what's missing."""
    if os.environ.get("STUDIO_VOICE_OFFLINE"):
        raise RuntimeError("narration missing: made by the app before a parallel or remote render, not here")


class _HTTPError(RuntimeError):
    def __init__(self, code: int, detail: str, status: str = ""):
        super().__init__(f"HTTP {code}: {detail}")
        self.code = code
        self.credits = status in ("quota_exceeded", "insufficient_credits", "payment_required")


def _elevenlabs_post(voice_id: str, api_key: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": api_key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            _usage(body["text"], body.get("model_id", ""), cost=r.headers.get("character-cost"))
            return json.load(r)
    except urllib.error.HTTPError as e:
        _usage(body["text"], body.get("model_id", ""), success=False)
        text = e.read().decode("utf-8", "replace")
        status = ""
        try:  # Preserve the provider code: HTTP 401 alone does not mean exhausted credits.
            body = json.loads(text)
            error = body.get("detail") or body.get("error") or {}
            detail = error["message"]
            status = error.get("status") or error.get("code") or ""
        except (ValueError, KeyError, TypeError):
            detail = text[:300]
        raise _HTTPError(e.code, detail, status) from None
    except (urllib.error.URLError, TimeoutError):
        _usage(body["text"], body.get("model_id", ""), success=False)
        raise


def _usage(words: str, model: str, *, cost=None, cached=False, success=True) -> None:
    """Developer-only request counters. Never store narration, keys or response contents."""
    file = os.environ.get("STUDIO_VOICE_METRICS_FILE")
    if not file:
        return
    try:
        billed = 0 if cached else float(cost) if cost is not None else None
        if billed is not None and (not math.isfinite(billed) or billed < 0):
            billed = None
    except (ValueError, TypeError):
        billed = None
    try:
        entry = {"at": int(time.time() * 1000), "model": model, "characters": len(words), "billedCharacters": billed, "cached": cached, "success": success}
        with open(file, "a", encoding="utf-8") as out:
            out.write(json.dumps(entry) + "\n")
    except (OSError, ValueError):
        pass  # measurement must never break narration


# --- word timing helpers -----------------------------------------------------------------


def _proportional_starts(words: str, start: float, end: float) -> list[float]:
    offsets = [m.start() for m in WORD.finditer(words)]
    n = max(len(words), 1)
    return [start + (end - start) * o / n for o in offsets]


def _boundaries(content: str, starts: list[float] | None, duration: float) -> list[dict]:
    """manim-voiceover word boundaries for `content` (text minus bookmark tags).

    `starts` holds one start time per word of the spoken text; words are matched by
    index, so double spaces left behind by removed bookmarks don't shift anything.
    An empty list makes the tracker fall back to a linear text→time mapping."""
    matches = list(WORD.finditer(content))
    if not starts or len(starts) != len(matches):
        return []
    out = [
        {
            "audio_offset": int(t * AUDIO_OFFSET_RESOLUTION),
            "text_offset": m.start(),
            "word_length": len(m.group()),
            "text": m.group(),
            "boundary_type": "Word",
        }
        for m, t in zip(matches, starts)
    ]
    # Close the range so a bookmark after the last word interpolates instead of erroring.
    out.append(
        {
            "audio_offset": int(duration * AUDIO_OFFSET_RESOLUTION),
            "text_offset": len(content) + 1,
            "word_length": 0,
            "text": "",
            "boundary_type": "Word",
        }
    )
    return out


def _load_starts(path: Path) -> list[float] | None:
    try:
        return json.loads(path.read_text())["starts"]
    except (OSError, ValueError, KeyError):
        return None


def _save_starts(path: Path, starts: list[float] | None) -> None:
    if starts:
        path.write_text(json.dumps({"starts": starts}))
