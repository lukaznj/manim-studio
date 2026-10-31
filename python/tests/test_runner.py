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
        self.assertEqual((self.result["width"], self.result["height"]), (1920, 1080))

    def test_sections(self):
        self.assertEqual([s["name"] for s in self.result["sections"]], ["Intro", "Mistakes"])

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
        self.assertEqual(self.result["voiceSettings"], {"provider": "none"})
        self.assertEqual(self.result["voiceIssues"], [])
        [v] = self.result["voice"]
        self.assertEqual(v["text"], "Let's look at the derivative.")
        self.assertEqual(v["source"], "silence")
        self.assertEqual([b["mark"] for b in v["bookmarks"]], ["A"])
        self.assertTrue(self.result["subtitles"])

    def test_offscreen_warning(self):
        kinds = {w["kind"] for w in self.result["warnings"]}
        self.assertIn("offscreen", kinds)


class CreditFailureRender(unittest.TestCase):
    def test_quota_failure_keeps_a_playable_video_and_recovery_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "project"
            shutil.copytree(HERE / "fixture", project)
            # A test-only provider replacement; no network request or credential is used.
            scene = project / "scene.py"
            scene.write_text(scene.read_text() + '''
import studio.voice as _test_voice
def _exhausted(*args):
    raise _test_voice._HTTPError(401, "Not enough credits", "quota_exceeded")
_test_voice._elevenlabs_post = _exhausted
''')
            env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "ELEVENLABS_API_KEY": "test-only", "STUDIO_VOICE": json.dumps({"provider": "elevenlabs", "language": "hr", "elevenlabs": {"voiceId": "test-only"}})}
            proc = subprocess.run([sys.executable, "-m", "studio_runner", "render", str(project)], capture_output=True, text=True, env=env, timeout=600)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            timeline = json.loads((project / ".studio" / "preview" / "timeline.json").read_text())
            self.assertTrue(Path(timeline["video"]).exists())
            self.assertGreater(Path(timeline["video"]).stat().st_size, 0)
            self.assertEqual(timeline["voice"][0]["source"], "silence")
            self.assertEqual(timeline["voiceIssues"][0]["kind"], "credits")
            self.assertEqual(timeline["voiceWarnings"], ["ElevenLabs credits exhausted"])


if __name__ == "__main__":
    unittest.main()
