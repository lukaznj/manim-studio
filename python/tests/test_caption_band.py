"""The band kept clear for subtitles (ADR 0027): only projects with captionBand get its warnings.

Run from python/:  pixi run python -m unittest discover tests"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PYTHON_DIR = Path(__file__).parent.parent
SCENE = """from manim import *
from studio import *


class Video(StudioScene):
    def construct(self):
        self.play(FadeIn(Text("Too low", font_size=40).to_edge(DOWN, buff=MARGIN)))
        self.play(FadeIn(Text("Fine", font_size=40).to_edge(DOWN, buff=BOTTOM_BUFF)))
        self.play(FadeIn(Text("Right", font_size=36).to_edge(RIGHT, buff=0.2).shift(UP * 2)))
        self.play(Create(Line(DOWN * 3.9, DOWN * 3.9 + RIGHT)))
"""


def warnings(aspect: str, band: bool) -> list[str]:
    tmp = Path(tempfile.mkdtemp())
    try:
        meta = {"name": "t", "aspect": aspect, "theme": "dark", "fps": 15, "createdAt": "x", "voice": {"provider": "elevenlabs", "language": "en"}}
        if band:
            meta["captionBand"] = True
        (tmp / "project.json").write_text(json.dumps(meta))
        (tmp / "scene.py").write_text(SCENE)
        env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "STUDIO_VOICE": json.dumps({"provider": "none"})}
        proc = subprocess.run([sys.executable, "-m", "studio_runner", "render", str(tmp)], capture_output=True, text=True, env=env, timeout=600)
        done = [json.loads(l[len("@@studio "):]) for l in proc.stdout.splitlines() if l.startswith("@@studio ") and '"done"' in l]
        if not done:
            raise AssertionError(f"render failed:\n{proc.stdout}\n{proc.stderr}")
        return [w["message"] for w in done[0]["result"]["warnings"]]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


class CaptionBand(unittest.TestCase):
    def test_landscape_text_in_the_bottom_band_is_flagged_not_lines_or_text_above(self):
        found = warnings("16:9", band=True)
        self.assertEqual([w.split(" is in ")[0] for w in found], ['Text "Too low"'])

    def test_portrait_also_keeps_the_right_edge_clear(self):
        found = warnings("9:16", band=True)
        self.assertEqual(sorted(w.split(" is in ")[0] for w in found), ['Text "Right"', 'Text "Too low"'])

    def test_older_projects_keep_their_even_margin(self):
        # BOTTOM_BUFF is the plain margin there, so "Fine" and "Too low" share a spot: an overlap, nothing about subtitles.
        self.assertFalse([w for w in warnings("16:9", band=False) if "subtitles" in w])


if __name__ == "__main__":
    unittest.main()
