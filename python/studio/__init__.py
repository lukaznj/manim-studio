"""What a project's scene.py imports: `from studio import *`.

The runner configures manim (resolution, frame size, theme) before this module is
imported, so the frame constants below match the project's aspect ratio."""

import os
from pathlib import Path

import numpy as np

from manim import ImageMobject, Mobject, config
from manim_voiceover import VoiceoverScene

from .brand import (  # noqa: F401 - re-exported for scenes
    ACCENT,
    BG,
    FONT,
    BLUE,
    CORAL,
    HIGHLIGHT,
    INK,
    MINT,
    MUTED,
    NAVY,
    NEGATIVE,
    PAPER,
    POSITIVE,
    SEA,
    SUN,
    TEXT,
    THEME,
)
from .voice import StudioSpeech

FRAME_W = config.frame_width
FRAME_H = config.frame_height
PORTRAIT = FRAME_H > FRAME_W
# Keep content this far from the edges; phones crop and overlay UI near them.
MARGIN = 0.5
# Projects made since 0.6 keep a band clear for the viewer's subtitles (project.json captionBand):
# the bottom, where players draw them, and in portrait also the right, where Shorts and TikTok put
# their buttons. Older projects keep the even margin they were made with.
CAPTION_BAND = os.environ.get("STUDIO_CAPTION_BAND") == "1"
BOTTOM_BUFF = (2.6 if PORTRAIT else 1.1) if CAPTION_BAND else MARGIN  # to_edge(DOWN, buff=BOTTOM_BUFF)
RIGHT_BUFF = 0.9 if CAPTION_BAND and PORTRAIT else MARGIN
SAFE_W = FRAME_W - MARGIN - RIGHT_BUFF
SAFE_H = FRAME_H - MARGIN - BOTTOM_BUFF
# The middle of the safe area: centre a full layout here rather than at ORIGIN.
SAFE_CENTER = np.array([(MARGIN - RIGHT_BUFF) / 2, (BOTTOM_BUFF - MARGIN) / 2, 0.0])


class StudioScene(VoiceoverScene):
    """A VoiceoverScene wired to the project's voice settings and recordings."""

    def setup(self) -> None:
        super().setup()
        project = Path(os.environ.get("STUDIO_PROJECT", "."))
        self.set_speech_service(StudioSpeech.from_env(project))
        # The project's background picture (Settings → Video), covering the frame behind everything.
        if os.environ.get("STUDIO_BG_IMAGE"):
            bg = ImageMobject(os.environ["STUDIO_BG_IMAGE"])
            bg.scale(max(FRAME_W / bg.width, FRAME_H / bg.height)).set_z_index(-1000)
            self.add(bg)

    def thumbnail(self, text: str | None = None) -> None:
        """Marks this moment for the video's thumbnail: call it right after the animation that
        completes the key picture. `text` is the hook printed on it (2 to 5 words). The renderer
        records it; outside a Studio render it does nothing."""


def fit(mobject: Mobject, width: float = SAFE_W, height: float = SAFE_H) -> Mobject:
    """Scale `mobject` down (never up) so it fits in width x height. Returns it."""
    scale = min(width / max(mobject.width, 1e-6), height / max(mobject.height, 1e-6), 1)
    return mobject.scale(scale)


from .media import VideoClip, image, media_path  # noqa: E402 - needs fit() above
from .sources import pdf_page, source_path  # noqa: E402 - needs fit() above

__all__ = [
    "StudioScene",
    "fit",
    "image",
    "VideoClip",
    "media_path",
    "pdf_page",
    "source_path",
    "FRAME_W",
    "FRAME_H",
    "PORTRAIT",
    "MARGIN",
    "SAFE_W",
    "SAFE_H",
    "SAFE_CENTER",
    "BOTTOM_BUFF",
    "RIGHT_BUFF",
    "CAPTION_BAND",
    "THEME",
    "FONT",
    "BG",
    "TEXT",
    "MUTED",
    "ACCENT",
    "HIGHLIGHT",
    "POSITIVE",
    "NEGATIVE",
    "INK",
    "NAVY",
    "PAPER",
    "BLUE",
    "SEA",
    "SUN",
    "CORAL",
    "MINT",
]
