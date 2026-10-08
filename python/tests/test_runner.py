"""Renders the fixture project end to end and checks the timeline it produces.

Run from python/:  pixi run python -m unittest discover tests"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parent
PYTHON_DIR = HERE.parent


class RenderTimeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        project = cls.tmp / "project"
        shutil.copytree(HERE / "fixture", project)
        env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "STUDIO_VOICE": json.dumps({"provider": "none"})}
        proc = subprocess.run(
            [sys.executable, "-m", "studio_runner", "render", str(project)],
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

    def test_video_written(self):
        self.assertTrue(Path(self.result["video"]).exists())
        self.assertEqual((self.result["width"], self.result["height"]), (854, 480))

    def test_sections(self):
        self.assertEqual([s["name"] for s in self.result["sections"]], ["Uvod", "Greška"])

    def test_clips_map_to_lines_and_edits(self):
        by_line = {}
        for c in self.result["clips"]:
            by_line.setdefault(c["line"], []).append(c)
        self.assertEqual(by_line[12][0]["edit"]["value"], 0.5)  # self.wait(0.5)
        self.assertEqual(by_line[16][0]["edit"]["prefix"], ", run_time=")  # play without run_time
        self.assertEqual(by_line[17][0]["edit"]["line"], 18)  # multi-line call: insert after FadeOut(wide)
        self.assertEqual(by_line[21][0]["repeat"], 2)  # loop: one literal drives both clips
        self.assertEqual(by_line[10][0]["locked"], "bookmark")

    def test_voice_and_subtitles(self):
        [v] = self.result["voice"]
        self.assertEqual(v["text"], "Pogledajmo derivaciju funkcije.")
        self.assertEqual(v["source"], "silence")
        self.assertEqual([b["mark"] for b in v["bookmarks"]], ["A"])
        self.assertTrue(self.result["subtitles"])

    def test_offscreen_warning(self):
        kinds = {w["kind"] for w in self.result["warnings"]}
        self.assertIn("offscreen", kinds)


if __name__ == "__main__":
    unittest.main()
