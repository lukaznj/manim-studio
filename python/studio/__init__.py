"""What a project's scene.py imports: `from studio import *`.

The runner configures manim (resolution, frame size, theme) before this module is
imported, so the frame constants below match the project's aspect ratio."""

import os
from pathlib import Path

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
SAFE_W = FRAME_W - 2 * MARGIN
SAFE_H = FRAME_H - 2 * MARGIN


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


def fit(mobject: Mobject, width: float = SAFE_W, height: float = SAFE_H) -> Mobject:
    """Scale `mobject` down (never up) so it fits in width x height. Returns it."""
    scale = min(width / max(mobject.width, 1e-6), height / max(mobject.height, 1e-6), 1)
    return mobject.scale(scale)


from .media import VideoClip, image, media_path  # noqa: E402 - needs fit() above

__all__ = [
    "StudioScene",
    "fit",
    "image",
    "VideoClip",
    "media_path",
    "FRAME_W",
    "FRAME_H",
    "PORTRAIT",
    "MARGIN",
    "SAFE_W",
    "SAFE_H",
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
