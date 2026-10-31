"""Delivery shape preserves picture content, audio and timing without rerunning a scene."""
import tempfile
import unittest
from pathlib import Path

import av
import numpy as np
from studio_runner.delivery import fit_video
from tests.test_concat import clip


class Delivery(unittest.TestCase):
    def test_all_four_corner_landmarks_remain_visible(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, out = Path(tmp) / 'source.mp4', Path(tmp) / 'delivery.mp4'
            colours = [(230, 30, 30), (30, 220, 30), (30, 30, 230), (220, 200, 20)]
            for width, height, aspect in [(320, 180, '9:16'), (180, 320, '16:9')]:
                image = np.full((height, width, 3), 40, dtype=np.uint8)
                for (y, x), colour in zip([(0, 0), (0, width - 30), (height - 30, 0), (height - 30, width - 30)], colours):
                    image[y:y + 30, x:x + 30] = colour
                with av.open(str(source), 'w') as container:
                    stream = container.add_stream('libx264', rate=1)
                    stream.width, stream.height, stream.pix_fmt = width, height, 'yuv420p'
                    container.mux(stream.encode(av.VideoFrame.from_ndarray(image, format='rgb24')))
                    container.mux(stream.encode())
                fit_video(source, out, aspect)
                with av.open(str(out)) as container:
                    fitted = next(container.decode(video=0)).to_ndarray(format='rgb24').astype(int)
                for colour in colours:
                    self.assertGreater((np.abs(fitted - colour).sum(axis=2) < 50).sum(), 40)

    def test_both_shapes_preserve_audio_timing_and_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for size, aspect, expected in [((320, 180), "9:16", (180, 320)), ((180, 320), "16:9", (320, 180))]:
                source, out = root / "source.mp4", root / "delivery.mp4"
                clip(source, 2, size=size)
                before = source.read_bytes()
                self.assertEqual(fit_video(source, out, aspect), dict(zip(["width", "height"], expected)))
                self.assertEqual(source.read_bytes(), before)
                with av.open(str(out)) as container:
                    stream = container.streams.video[0]
                    self.assertEqual((stream.width, stream.height), expected)
                    self.assertEqual(len(container.streams.audio), 1)
                    self.assertAlmostEqual(float(stream.duration * stream.time_base), 2, delta=.1)
                    self.assertEqual(len(list(container.decode(video=0))), 60)

    def test_matching_shape_copies_without_encoding_and_invalid_choices_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, out = Path(tmp) / "source.mp4", Path(tmp) / "delivery.mp4"
            clip(source, 1)
            fit_video(source, out, "16:9")
            self.assertEqual(out.read_bytes(), source.read_bytes())
            with self.assertRaises(ValueError): fit_video(source, out, "square")
            with self.assertRaises(ValueError): fit_video(source, source, "9:16")
