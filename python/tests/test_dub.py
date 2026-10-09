"""The dubbed subtitles: pieces of at most CUE_CHARS, back to back, covering the speech exactly."""

import unittest

from studio_runner.dub import CUE_CHARS, _cues


class CueTest(unittest.TestCase):
    def test_pieces_fit_and_cover_the_speech(self):
        text = "Eine Parabel ist der Graph einer quadratischen Funktion, und ihr tiefster Punkt heißt Scheitelpunkt."
        cues = _cues(text, 2.0, 7.0)
        self.assertGreater(len(cues), 1)
        self.assertTrue(all(len(c["text"]) <= CUE_CHARS for c in cues))
        self.assertEqual(" ".join(c["text"] for c in cues), text)
        self.assertAlmostEqual(cues[0]["start"], 2.0)
        self.assertAlmostEqual(cues[-1]["end"], 7.0, places=2)
        for a, b in zip(cues, cues[1:]):
            self.assertAlmostEqual(a["end"], b["start"], places=2)


if __name__ == "__main__":
    unittest.main()
