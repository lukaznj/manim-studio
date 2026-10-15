"""The exported thumbnail (studio_runner/card.py).

Run from python/:  pixi run python -m unittest discover tests"""

import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from studio_runner.card import card, concept_time
from tests.test_concat import clip


def timeline(video: str, mark=None) -> dict:
    sections = [{"name": "Title", "start": 0, "end": 1}, {"name": "Idea", "start": 1, "end": 1.8}, {"name": "Recap", "start": 1.8, "end": 2}]
    return {"video": video, "duration": 2, "sections": sections, "thumbnail": mark}


class Card(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_the_marked_moment_or_the_longest_section_after_the_title(self):
        self.assertAlmostEqual(concept_time(timeline("v", {"t": 0.5, "text": "Hook"})), 0.46)
        self.assertAlmostEqual(concept_time(timeline("v")), 1.5)  # "Idea", not the longer title

    def test_a_card_is_youtube_sized_in_either_format(self):
        for size, expected in (((320, 180), (1280, 720)), ((180, 320), (720, 1280))):
            video = self.tmp / f"{size[0]}.mp4"
            clip(video, 2, size=size)
            out = self.tmp / f"{size[0]}.jpg"
            card(timeline(str(video), {"t": 1.2, "text": "Zašto je tjeme minimum?"}), str(out), text="Title", badge="#13", kicker="Kvadratna funkcija")
            self.assertEqual(Image.open(out).size, expected)


if __name__ == "__main__":
    unittest.main()
