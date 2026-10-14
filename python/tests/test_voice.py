"""ElevenLabs requests: the language is pinned, and a model that rejects that still speaks."""

import base64
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


if __name__ == "__main__":
    unittest.main()
