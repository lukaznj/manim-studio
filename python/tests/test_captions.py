"""Maths in subtitles (ADR 0063): plain text for files, and formulas never split across cues."""

import unittest

from studio_runner.captions import plain


class Plain(unittest.TestCase):
    def test_writes_formulas_as_unicode(self):
        self.assertEqual(plain("Ako je $\\tau \\ll T_P$, impuls prolazi."), "Ako je τ ≪ Tₚ, impuls prolazi.")
        self.assertEqual(plain("$\\omega_g \\gg 1/T_P$"), "ω_g ≫ 1/Tₚ")
        self.assertEqual(plain("$x^2 + y_{12}$"), "x² + y₁₂")
        self.assertEqual(plain("$\\frac{T}{2} = 0{,}5\\,\\mathrm{ms}$"), "T/2 = 0,5 ms")
        self.assertEqual(plain("$\\sqrt{a+b}$ i $V_{CC}$"), "√(a+b) i V_(CC)")

    def test_leaves_text_without_maths_alone(self):
        self.assertEqual(plain("Cijena je 5 $ ili 4 €."), "Cijena je 5 $ ili 4 €.")
        self.assertEqual(plain("te pe, gotovo cijeli spektar"), "te pe, gotovo cijeli spektar")


class Cues(unittest.TestCase):
    def test_a_formula_stays_in_one_cue(self):
        from studio import StudioScene

        cues = []

        class Fake:
            def add_subcaption(self, text, duration, offset):
                cues.append((text, offset, duration))

        text = "Izobličenje ovisi o tome kolika je $\\tau = RC$ u usporedbi s $T_P$: ako je $\\tau \\ll T_P$, izlaz prati ulaz."
        StudioScene.add_wrapped_subcaption(Fake(), text, 6.0, max_subcaption_len=40)
        self.assertGreater(len(cues), 1)
        for piece, _, _ in cues:
            self.assertEqual(piece.count("$") % 2, 0, piece)
        self.assertEqual(" ".join(c[0] for c in cues), text)
        self.assertIn("$T_P$:", " ".join(c[0] for c in cues))  # punctuation stays on the formula


class Files(unittest.TestCase):
    def test_subtitle_files_have_plain_maths(self):
        import tempfile
        from pathlib import Path

        from studio_runner.media import write_subtitles

        with tempfile.TemporaryDirectory() as tmp:
            vtt, srt = Path(tmp) / "a.vtt", Path(tmp) / "a.srt"
            write_subtitles([{"start": 0, "end": 1.5, "text": "Ako je $\\tau \\ll T_P$"}], vtt, srt)
            self.assertIn("Ako je τ ≪ Tₚ", srt.read_text(encoding="utf-8"))
            self.assertIn("Ako je τ ≪ Tₚ", vtt.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
