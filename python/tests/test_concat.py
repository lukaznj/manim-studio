"""Joining an exercise set's videos into a lecture (studio_runner/concat.py).

Run from python/:  pixi run python -m unittest discover tests"""

import shutil
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

import av
import numpy as np

from studio_runner.concat import concat


def clip(path: Path, seconds: int, size=(320, 180)) -> None:
    """An H.264 + AAC clip like an export: B-frames and AAC priming start it a little before 0."""
    with av.open(str(path), "w") as out:
        v = out.add_stream("libx264", rate=30)
        v.width, v.height = size
        v.pix_fmt = "yuv420p"
        a = out.add_stream("aac", rate=44100)
        for i in range(seconds * 30):
            frame = av.VideoFrame.from_ndarray(np.full((size[1], size[0], 3), i % 255, dtype=np.uint8), format="rgb24")
            out.mux(v.encode(frame))
        samples = np.zeros((1, 1024), dtype=np.float32)
        for i in range(seconds * 44100 // 1024):
            frame = av.AudioFrame.from_ndarray(samples, format="fltp", layout="mono")
            frame.sample_rate = 44100
            frame.pts = i * 1024
            frame.time_base = Fraction(1, 44100)
            out.mux(a.encode(frame))
        out.mux(v.encode())
        out.mux(a.encode())


class Concat(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_joins_in_order_with_every_frame(self):
        clip(self.tmp / "a.mp4", 1)
        clip(self.tmp / "b.mp4", 2)
        durations = concat(self.tmp / "out.mp4", [self.tmp / "a.mp4", self.tmp / "b.mp4"])
        self.assertEqual(len(durations), 2)
        self.assertAlmostEqual(durations[0], 1, delta=0.15)
        with av.open(str(self.tmp / "out.mp4")) as c:
            frames = sum(1 for _ in c.decode(video=0))
        self.assertEqual(frames, 90)

    def test_refuses_videos_of_another_size(self):
        clip(self.tmp / "a.mp4", 1)
        clip(self.tmp / "b.mp4", 1, size=(640, 360))
        with self.assertRaises(ValueError):
            concat(self.tmp / "out.mp4", [self.tmp / "a.mp4", self.tmp / "b.mp4"])


if __name__ == "__main__":
    unittest.main()
