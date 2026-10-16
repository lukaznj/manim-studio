"""Exports on the GPU (studio_runner/encoder.py): the encoder swap inside manim's writer, and detection.

CI has no GPU, so the swap is checked with ffmpeg's own mpeg4 encoder, which every build has: if the
partial movies come out as mpeg4, the hardware encoder would have been opened the same way.

Run from python/:  pixi run python -m unittest discover tests"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import av

from studio_runner.encoder import CANDIDATES, detect, probe, short_name, stream_settings

HERE = Path(__file__).parent
PYTHON_DIR = HERE.parent


class EncoderSwap(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.project = cls.tmp / "project"
        shutil.copytree(HERE / "fixture", cls.project)
        env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "STUDIO_VOICE": json.dumps({"provider": "none"})}
        proc = subprocess.run(
            [sys.executable, "-m", "studio_runner", "render", str(cls.project), "--encoder", "mpeg4"],
            capture_output=True, text=True, env=env, timeout=600,
        )
        events = [json.loads(l[len("@@studio "):]) for l in proc.stdout.splitlines() if l.startswith("@@studio ")]
        done = [e for e in events if e["type"] == "done"]
        if not done:
            raise AssertionError(f"render failed:\n{proc.stdout}\n{proc.stderr}")
        cls.result = done[0]["result"]

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_partial_movies_use_the_encoder_in_their_own_folder(self):
        folder = self.project / ".studio" / "cache" / "partial" / "854x480@15-mpeg4"
        pieces = list(folder.glob("*.mp4"))
        self.assertTrue(pieces, f"no partial movies in {folder}")
        with av.open(str(pieces[0])) as c:
            self.assertEqual(c.streams.video[0].codec_context.name, "mpeg4")

    def test_the_video_is_joined_without_another_encode(self):
        with av.open(self.result["video"]) as c:
            self.assertEqual(c.streams.video[0].codec_context.name, "mpeg4")
            self.assertGreater(c.duration or 0, 0)


class Detection(unittest.TestCase):
    def test_detect_reports_every_candidate_it_tried(self):
        found = detect()
        names = [t["encoder"] for t in found["tried"]]
        self.assertTrue(set(names) <= set(CANDIDATES.get(sys.platform, [])))
        if found["encoder"]:
            self.assertIn(found["encoder"], names)
            self.assertIsNone(found["tried"][-1]["error"])

    def test_probe_names_what_failed(self):
        self.assertIsNone(probe("mpeg4"))
        self.assertIsNotNone(probe("no_such_encoder"))

    def test_settings(self):
        options, pix_fmt, rate = stream_settings("h264_mf", 1920, 1080, 30)
        self.assertEqual((options["hw_encoding"], pix_fmt), ("1", "nv12"))
        self.assertEqual(rate, int(1920 * 1080 * 30 * 0.08))
        self.assertEqual(stream_settings("h264_nvenc", 1920, 1080, 30)[2], None)  # constant quality
        self.assertEqual(short_name("h264_nvenc"), "nvenc")


if __name__ == "__main__":
    unittest.main()
