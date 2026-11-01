"""Burning subtitles into a saved copy: the .srt → ASS conversion and a real ffmpeg pass."""

import subprocess
import tempfile
import unittest
from pathlib import Path

from studio_runner.burn import ass_colour, ass_time, burn, parse_srt, to_ass

SRT = "1\n00:00:00,200 --> 00:00:01,800\nZbroj kutova je {180°}\n\n2\n00:00:02,000 --> 00:00:03,500\nDruga linija\ni treća\n"
STYLE = {"size": 100, "color": "#ffffff", "background": "#000000", "opacity": 70, "position": "bottom", "outline": True}


class Conversion(unittest.TestCase):
    def test_parses_cues_with_multiline_text_and_bom(self):
        cues = parse_srt("﻿" + SRT)
        self.assertEqual([(round(a, 1), round(b, 1)) for a, b, _ in cues], [(0.2, 1.8), (2.0, 3.5)])
        self.assertEqual(cues[1][2], "Druga linija\ni treća")

    def test_ass_times_and_colours(self):
        self.assertEqual(ass_time(3723.456), "1:02:03.46")
        self.assertEqual(ass_colour("#ff8000"), "&H000080FF")
        self.assertEqual(ass_colour("#000000", 70), "&H4C000000")

    def test_style_sits_in_the_subtitle_band(self):
        ass = to_ass(parse_srt(SRT), 1920, 1080, STYLE, band=True)
        style = next(line for line in ass.splitlines() if line.startswith("Style:")).split(",")
        size, align, margin_v = int(style[2]), int(style[18]), int(style[21])
        self.assertEqual(align, 2)  # bottom centre
        self.assertLessEqual(margin_v + size, 1080 * 1.1 / 8)  # inside the band's 148 px
        self.assertIn("{", SRT)
        self.assertNotIn("{180", ass)  # braces would be override tags
        self.assertIn("Druga linija\\Ni treća", ass)
        top = to_ass(parse_srt(SRT), 1080, 1920, {**STYLE, "position": "top"}, band=True)
        self.assertEqual(int(next(l for l in top.splitlines() if l.startswith("Style:")).split(",")[18]), 8)


class Burn(unittest.TestCase):
    def test_burns_text_into_the_band(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            video, srt, out = tmp / "in.mp4", tmp / "in.srt", tmp / "out" / "copy.mp4"
            subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x1e1e2e:s=640x360:d=4",
                            "-f", "lavfi", "-i", "sine=d=4", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)], check=True)
            srt.write_text(SRT, encoding="utf-8")
            result = burn(video, srt, out, STYLE, band=True)
            self.assertEqual((result["width"], result["height"], result["lines"]), (640, 360, 2))
            self.assertFalse(list(out.parent.glob("*.ass")))
            frame = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", "1", "-i", str(out), "-frames:v", "1",
                                    "-f", "rawvideo", "-pix_fmt", "gray", "-"], check=True, capture_output=True).stdout
            rows = [frame[y * 640:(y + 1) * 640] for y in range(360)]
            bright = [y for y, row in enumerate(rows) if max(row) > 200]
            self.assertTrue(bright, "no subtitle text was drawn")
            self.assertGreaterEqual(min(bright), 360 - 360 * 1.1 / 8 - 2)  # all of it in the bottom band
            streams = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(out)],
                                     check=True, capture_output=True, text=True).stdout.split()
            self.assertEqual(sorted(streams), ["audio", "video"])


if __name__ == "__main__":
    unittest.main()
