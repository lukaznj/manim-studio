"""Browser inserts become silent, correctly timed VideoClip media, atomically."""
import tempfile
import unittest
from pathlib import Path

import av
from PIL import Image

from studio_runner.motion import encode


class MotionEncoding(unittest.TestCase):
    def test_frames_preserve_order_dimensions_and_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for i in range(30):
                Image.new('RGB', (160, 90), (240, 20, 20) if i < 15 else (20, 20, 240)).save(root / f'{i:04}.png')
            output = root / 'clip.mp4'
            result = encode(root, output, 30)
            self.assertEqual(result['frames'], 30)
            with av.open(str(output)) as container:
                stream = container.streams.video[0]
                self.assertEqual((stream.width, stream.height), (160, 90))
                self.assertAlmostEqual(float(stream.duration * stream.time_base), 1, delta=.01)
                self.assertEqual(len(container.streams.audio), 0)
                frames = list(container.decode(video=0))
                self.assertEqual(len(frames), 30)
                self.assertGreater(frames[0].to_ndarray(format='rgb24')[0, 0, 0], 200)
                self.assertGreater(frames[-1].to_ndarray(format='rgb24')[0, 0, 2], 200)

    def test_bad_frames_never_replace_existing_playable_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / 'clip.mp4'
            output.write_bytes(b'previous working media')
            with self.assertRaises(ValueError): encode(root, output)
            Image.new('RGB', (160, 90)).save(root / '0000.png')
            Image.new('RGB', (180, 90)).save(root / '0001.png')
            with self.assertRaises(ValueError): encode(root, output)
            self.assertEqual(output.read_bytes(), b'previous working media')
            self.assertEqual(list(root.glob('*.partial.mp4')), [])
            (root / '0001.png').rename(root / '0002.png')
            with self.assertRaises(ValueError): encode(root, output)
            with self.assertRaises(ValueError): encode(root, output, 100)
