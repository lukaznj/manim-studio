"""PDF sources: indexing, page images and pdf_page() in a real render.

Run from python/:  pixi run python -m unittest discover tests"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from studio_runner import sources

HERE = Path(__file__).parent
PYTHON_DIR = HERE.parent


def make_pdf(path: Path) -> None:
    """Three A4 pages; the second has no text, like a scanned page."""
    import cairo

    surface = cairo.PDFSurface(str(path), 595, 842)
    c = cairo.Context(surface)
    for text in ["Exercise 1: derive x²", None, "Exercise 3: čćž"]:
        c.set_source_rgb(1, 1, 1)
        c.paint()
        c.set_source_rgb(0, 0, 0)
        if text:
            c.set_font_size(24)
            c.move_to(60, 120)
            c.show_text(text)
        c.rectangle(60, 400, 200, 200)
        c.stroke()
        c.show_page()
    surface.finish()


class Sources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.pdf = cls.tmp / "notes.pdf"
        make_pdf(cls.pdf)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_index(self):
        out = self.tmp / "index"
        info = sources.index(self.pdf, out)
        self.assertEqual(info["pages"], 3)
        self.assertEqual(info["noText"], [2])
        self.assertEqual(info["sizes"][0], [595.0, 842.0])
        text = (out / "text.txt").read_text(encoding="utf-8")
        self.assertIn("=== Page 1 ===\nExercise 1: derive x²", text)
        self.assertIn("=== Page 3 ===\nExercise 3: čćž", text)
        self.assertNotIn("\r", text)
        self.assertTrue((out / "thumb.png").exists())
        self.assertEqual(json.loads((out / "info.json").read_text(encoding="utf-8")), info)

    def test_pages(self):
        from PIL import Image

        out = self.tmp / "pages"
        [p1, p3] = sources.pages(self.pdf, out, [1, 3], 300)
        with Image.open(p3) as im:
            self.assertEqual(im.width, 300)
        self.assertEqual(Path(p1).name, "page-1-300.png")
        with self.assertRaisesRegex(ValueError, "has 3 pages"):
            sources.pages(self.pdf, out, [4], 300)

    def test_pdf_page_in_a_render(self):
        project = self.tmp / "project"
        shutil.copytree(HERE / "fixture", project)
        (project / "sources").mkdir()
        shutil.copyfile(self.pdf, project / "sources" / "notes.pdf")
        (project / "scene.py").write_text(
            "from manim import *\nfrom studio import *\n\n\n"
            "class Video(StudioScene):\n"
            "    def construct(self):\n"
            '        page = pdf_page("notes.pdf", 1)\n'
            '        top = pdf_page("notes.pdf", 3, crop=(0, 0, 1, 0.25))\n'
            "        assert page.height <= SAFE_H + 1e-6 and top.width <= SAFE_W + 1e-6\n"
            "        assert top.width / top.height > 2, (top.width, top.height)\n"
            "        self.play(FadeIn(page), run_time=0.2)\n"
            "        self.play(FadeTransform(page, top), run_time=0.2)\n",
            encoding="utf-8",
        )
        env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "STUDIO_VOICE": json.dumps({"provider": "none"})}
        proc = subprocess.run([sys.executable, "-m", "studio_runner", "render", str(project)], capture_output=True, text=True, env=env, timeout=600)
        events = [json.loads(l[len("@@studio ") :]) for l in proc.stdout.splitlines() if l.startswith("@@studio ")]
        self.assertTrue(any(e["type"] == "done" for e in events), f"render failed:\n{proc.stdout}\n{proc.stderr}")

    def test_missing_source_lists_what_is_there(self):
        project = self.tmp / "listing"
        (project / "sources").mkdir(parents=True)
        shutil.copyfile(self.pdf, project / "sources" / "notes.pdf")
        env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "STUDIO_PROJECT": str(project)}
        code = "from studio import source_path\ntry:\n    source_path('nope.pdf')\nexcept FileNotFoundError as e:\n    print(e)"
        out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, timeout=300)
        self.assertIn('No source "nope.pdf". In sources/: notes.pdf', out.stdout, out.stderr)


if __name__ == "__main__":
    unittest.main()
