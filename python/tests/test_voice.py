"""ElevenLabs requests: the language is pinned, and a model that rejects that still speaks."""

import base64
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from studio import voice


class ElevenLabsTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.bodies = []
        self.enterContext(mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test"}))

    def speak(self, model_id, replies):
        def post(_voice_id, _key, body):
            self.bodies.append(dict(body))
            reply = replies.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return reply

        settings = {"provider": "elevenlabs", "language": "pt-BR", "elevenlabs": {"voiceId": "v", "modelId": model_id}}
        with mock.patch.object(voice, "_elevenlabs_post", post):
            return voice.StudioSpeech(self.dir, settings)._elevenlabs("Olá mundo", "k1")

    def test_language_is_pinned_and_dropped_when_rejected(self):
        audio = {"audio_base64": base64.b64encode(b"mp3").decode()}
        self.speak("eleven_v4", [voice._HTTPError(400, "unsupported language"), audio])
        self.assertEqual(self.bodies[0]["language_code"], "pt")
        self.assertNotIn("language_code", self.bodies[1])

    def test_default_model_is_v4(self):
        settings = {"provider": "elevenlabs", "language": "en", "elevenlabs": {"voiceId": "v"}}
        with mock.patch.object(voice, "_elevenlabs_post", lambda _v, _k, body: self.bodies.append(dict(body)) or {"audio_base64": ""}):
            voice.StudioSpeech(self.dir, settings)._elevenlabs("Hello", "k2")
        self.assertEqual(self.bodies[0]["model_id"], "eleven_v4")

    def test_other_errors_are_not_retried(self):
        with self.assertRaisesRegex(RuntimeError, "HTTP 401"):
            self.speak("eleven_v3", [voice._HTTPError(401, "missing permission voices_read")])
        self.assertEqual(len(self.bodies), 1)


class CachedNarrationTest(unittest.TestCase):
    """A render worker has no key and must never generate: it uses what the app made."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.settings = {"provider": "elevenlabs", "language": "en", "elevenlabs": {"voiceId": "v", "modelId": "eleven_v4"}}

    def test_cached_narration_needs_no_key(self):
        speech = voice.StudioSpeech(self.dir, self.settings)
        rel, path, _ = speech._cached("Hello", "k1", ".mp3", "elevenlabs", "v", "eleven_v4")
        path.write_bytes(b"mp3")
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "", "STUDIO_VOICE_OFFLINE": "1"}):
            self.assertEqual(speech._elevenlabs("Hello", "k1")[0], rel)

    def test_offline_never_generates(self):
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "key", "STUDIO_VOICE_OFFLINE": "1"}), mock.patch.object(voice, "_elevenlabs_post") as post:
            with self.assertRaisesRegex(RuntimeError, "narration missing"):
                voice.StudioSpeech(self.dir, self.settings)._elevenlabs("Not made yet", "k2")
            post.assert_not_called()


class VoiceUsageTest(unittest.TestCase):
    def test_network_failure_keeps_billing_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "usage.jsonl"
            with mock.patch.dict(os.environ, {"STUDIO_VOICE_METRICS_FILE": str(file)}), mock.patch.object(voice.urllib.request, "urlopen", side_effect=voice.urllib.error.URLError("connection lost")):
                with self.assertRaises(voice.urllib.error.URLError):
                    voice._elevenlabs_post("v", "secret", {"text": "Hello", "model_id": "v4"})
            entry = json.loads(file.read_text())
            self.assertFalse(entry["success"])
            self.assertIsNone(entry["billedCharacters"])

    def test_response_billing_is_recorded_without_text_or_key(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "usage.jsonl"
            response = io.BytesIO(b'{"audio_base64": ""}')
            response.headers = {"character-cost": "2.5"}
            with mock.patch.dict(os.environ, {"STUDIO_VOICE_METRICS_FILE": str(file)}), mock.patch.object(voice.urllib.request, "urlopen", return_value=response):
                voice._elevenlabs_post("v", "secret-key", {"text": "Privatno č", "model_id": "v4"})
            entry = json.loads(file.read_text())
            self.assertEqual(entry["billedCharacters"], 2.5)
            self.assertEqual(entry["characters"], len("Privatno č"))
            self.assertNotIn("Privatno", file.read_text())
            self.assertNotIn("secret-key", file.read_text())

    def test_cached_zero_and_unknown_billing_are_distinct(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "usage.jsonl"
            with mock.patch.dict(os.environ, {"STUDIO_VOICE_METRICS_FILE": str(file)}):
                voice._usage("text", "v4", cached=True)
                voice._usage("text", "v4")
                voice._usage("text", "v4", cost="NaN")
                voice._usage("text", "v4", success=False)
            entries = [json.loads(line) for line in file.read_text().splitlines()]
            self.assertEqual(entries[0]["billedCharacters"], 0)
            self.assertIsNone(entries[1]["billedCharacters"])
            self.assertIsNone(entries[2]["billedCharacters"])
            self.assertFalse(entries[3]["success"])


class CreditRecoveryTest(unittest.TestCase):
    def test_local_fallback_uses_a_separate_cache_without_paid_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            speech = voice.StudioSpeech(Path(directory), {"provider": "omnivoice", "language": "hr"})
            def synthesize(req, **kwargs):
                body = json.loads(req.data)
                # Match the local worker's contract: it writes audio at the requested path.
                with voice.wave.open(body["out"], "wb") as audio:
                    audio.setnchannels(1)
                    audio.setsampwidth(2)
                    audio.setframerate(22050)
                    audio.writeframes(b"\0\0" * 22050)
                return io.BytesIO(b'{}')
            with mock.patch.dict(os.environ, {"STUDIO_TTS_URL": "http://127.0.0.1:1234", "STUDIO_VOICE_OFFLINE": ""}), mock.patch.object(voice.urllib.request, "urlopen", side_effect=synthesize) as local, mock.patch.object(voice, "_elevenlabs_post") as paid:
                file, _, source = speech._audio_for("Napon i struja", "first")
                self.assertEqual(source, "omnivoice")
                self.assertTrue((Path(directory) / file).exists())
                speech._audio_for("Napon i struja", "first")
                self.assertEqual(local.call_count, 1)
                paid.assert_not_called()

    def test_quota_does_not_repeat_requests_and_cached_voice_still_plays(self):
        with tempfile.TemporaryDirectory() as directory:
            speech = voice.StudioSpeech(Path(directory), {"provider": "elevenlabs", "elevenlabs": {"voiceId": "v", "modelId": "v4"}})
            error = voice._HTTPError(401, "Not enough credits", "quota_exceeded")
            with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test", "STUDIO_VOICE_OFFLINE": ""}), mock.patch.object(voice, "_elevenlabs_post", side_effect=error) as post:
                self.assertEqual(speech._audio_for("First sentence", "first")[2], "silence")
                self.assertEqual(speech._audio_for("Second sentence", "second")[2], "silence")
                self.assertEqual(post.call_count, 1)
                rel, path, _ = speech._cached("Cached", "cached", ".mp3", "elevenlabs", "v", "v4")
                path.write_bytes(b"existing audio")
                self.assertEqual(speech._audio_for("Cached", "cached")[2], "elevenlabs")
                self.assertEqual(post.call_count, 1)
            # A new render retries the paid provider; silence is not its narration cache.
            retried = voice.StudioSpeech(Path(directory), speech.settings)
            with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test", "STUDIO_VOICE_OFFLINE": ""}), mock.patch.object(voice, "_elevenlabs_post", return_value={"audio_base64": base64.b64encode(b"mp3").decode()}) as post:
                self.assertEqual(retried._audio_for("First sentence", "first")[2], "elevenlabs")
                self.assertEqual(post.call_count, 1)

    def test_provider_error_code_distinguishes_quota_from_auth_and_rate_limits(self):
        for status, credits in [("quota_exceeded", True), ("insufficient_credits", True), ("invalid_api_key", False), ("too_many_requests", False)]:
            error = voice.urllib.error.HTTPError("https://example.test", 401, "error", {}, io.BytesIO(json.dumps({"detail": {"status": status, "message": "Provider explanation"}}).encode()))
            with mock.patch.object(voice.urllib.request, "urlopen", side_effect=error):
                with self.assertRaises(voice._HTTPError) as caught:
                    voice._elevenlabs_post("v", "never logged", {"text": "Private words"})
                self.assertEqual(caught.exception.credits, credits)


if __name__ == "__main__":
    unittest.main()
