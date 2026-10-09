"""Speech for StudioScene.

Each `with self.voiceover(text=...)` block gets, in order of preference:
1. a human recording at voice/recordings/<key>.wav (made in the app's recording booth),
2. the project's TTS provider (the OS voice for the project's language, ElevenLabs or
   local OmniVoice),
3. silence of an estimated length, if the provider fails, so a render never blocks on TTS.

`key` depends only on the spoken words (bookmarks and whitespace ignored), so moving a
bookmark never invalidates a recording. Audio lives in the project's voice/ folder and is
committed with the project: re-generating it costs money or a re-take.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
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
# macOS ships joke voices (Bubbles, Zarvox…) and robotic ones; never pick those automatically.
NOVELTY_VOICES = {
    "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester",
    "Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Fred", "Junior", "Kathy", "Ralph",
    # The Eloquence voices are listed for every language and sound robotic.
    "Eddy", "Flo", "Grandma", "Grandpa", "Reed", "Rocko", "Sandy", "Shelley",
}
PREFERRED_VOICES = {"en": ["Samantha", "Daniel", "Karen", "Moira", "Alex"], "hr": ["Lana"]}

# Read by the runner after the render: which source each block used, and problems.
USED: dict[str, str] = {}
WARNINGS: list[str] = []


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

        provider = self.settings.get("provider", "system")
        try:
            if provider == "elevenlabs":
                return (*self._elevenlabs(words, key), "elevenlabs")
            if provider == "omnivoice":
                return (*self._omnivoice(words, key), "omnivoice")
            if provider == "system":
                result = self._system(words, key)
                if result:
                    return (*result, "system")
        except Exception as e:  # noqa: BLE001 - any provider failure degrades to silence
            WARNINGS.append(f"{provider}: {e}")
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

    def _system(self, words: str, key: str):
        language = self.settings.get("language", "en")
        voice = self.settings.get("systemVoice") or _default_system_voice(language)
        rel, path, starts = self._cached(words, key, ".wav", "system", voice or language)
        if path.exists():
            return rel, starts
        if platform.system() == "Darwin":
            if not voice:
                raise RuntimeError(f"no macOS voice installed for '{language}' (System Settings → Accessibility → Spoken Content)")
            subprocess.run(
                ["say", "-v", voice, "-o", str(path), "--data-format=LEI16@22050", words],
                check=True,
                capture_output=True,
            )
        elif platform.system() == "Windows":
            ps = (
                "Add-Type -AssemblyName System.Speech;"
                "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
                "$v=$s.GetInstalledVoices()|?{$_.VoiceInfo.Culture.Name -like ($env:STUDIO_LANG+'*')}|select -First 1;"
                "if($v){$s.SelectVoice($v.VoiceInfo.Name)};"
                "$s.SetOutputToWaveFile($env:STUDIO_OUT);$s.Speak($env:STUDIO_TEXT);$s.Dispose()"
            )
            env = {**os.environ, "STUDIO_OUT": str(path), "STUDIO_TEXT": words, "STUDIO_LANG": language.split("-")[0]}
            subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True, capture_output=True, env=env)
        else:
            espeak = shutil.which("espeak-ng") or shutil.which("espeak")
            if not espeak:
                raise RuntimeError("no system voice found (install espeak-ng)")
            subprocess.run([espeak, "-v", language.split("-")[0], "-w", str(path), words], check=True, capture_output=True)
        return rel, None

    def _elevenlabs(self, words: str, key: str):
        s = self.settings.get("elevenlabs", {})
        api_key = os.environ.get("ELEVENLABS_API_KEY", "")
        voice_id = s.get("voiceId", "")
        model_id = s.get("modelId", "eleven_multilingual_v2")
        if not api_key:
            raise RuntimeError("no ElevenLabs API key (Settings → Voice)")
        if not voice_id:
            raise RuntimeError("no ElevenLabs voice chosen (Settings → Voice)")
        rel, path, starts = self._cached(words, key, ".mp3", "elevenlabs", voice_id, model_id)
        if path.exists():
            return rel, starts

        body: dict = {"text": words, "model_id": model_id}
        # Only the v2.5 models accept a forced language; the others reject the field.
        if model_id.endswith("v2_5"):
            body["language_code"] = self.settings.get("language", "hr")
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
            "?output_format=mp3_44100_128",
            data=json.dumps(body).encode(),
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:  # ElevenLabs explains failures in detail.message (e.g. a missing key permission)
                detail = json.loads(body)["detail"]["message"]
            except (ValueError, KeyError, TypeError):
                detail = body[:300]
            raise RuntimeError(f"HTTP {e.code}: {detail}") from None

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
        if not url:
            raise RuntimeError("the local OmniVoice worker isn't running")
        ref = s.get("refAudio") or ""
        rel, path, starts = self._cached(words, key, ".wav", "omnivoice", ref, s.get("refText", ""))
        if path.exists():
            return rel, starts
        payload = {"text": words, "out": str(path), "refAudio": ref, "refText": s.get("refText", "")}
        req = urllib.request.Request(
            url + "/synthesize", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=600) as r:
            json.load(r)
        return rel, None


def _default_system_voice(language: str) -> str | None:
    """A natural-sounding installed voice for the language (macOS); None elsewhere or if none."""
    if platform.system() != "Darwin":
        return None
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    # "Daniel   en_GB  # …" or, for newer voices, "Lana (Croatian (Croatia)) hr_HR  # …"
    voices = re.findall(r"^(.+?)\s+([a-z]{2,3})_([A-Z]{2})\s+#", out, re.M)
    base, _, region = language.partition("-")
    names = [(re.sub(r"\s*\(.*\)$", "", name).strip(), lang, reg) for name, lang, reg in voices]
    matching = [(name, reg) for name, lang, reg in names if lang == base and name not in NOVELTY_VOICES]
    preferred = PREFERRED_VOICES.get(base, [])
    rank = lambda name: preferred.index(name) if name in preferred else len(preferred)  # noqa: E731
    # The requested region first (en-GB → a British voice), then the natural-sounding ones.
    matching.sort(key=lambda v: (bool(region) and v[1] != region.upper(), rank(v[0])))
    return matching[0][0] if matching else None


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
