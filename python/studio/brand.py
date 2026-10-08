"""The Studio palette and per-project theme. Scenes use the semantic names
(TEXT, ACCENT, ...) so a project can switch light/dark without code changes."""

import os
from pathlib import Path

from manim import MarkupText, MathTex, Paragraph, Tex, Text, config

# Raw palette (it started from the Maturita app's tokens).
INK = "#16181D"
NAVY = "#091E36"
PAPER = "#F7F8FA"
BLUE = "#2F6DF6"
SEA = "#1E70A6"
SUN = "#FFD166"
CORAL = "#FF6F59"
MINT = "#2F9E44"

_THEMES = {
    "dark": {
        "BG": "#0B1626",
        "TEXT": "#F2F5F9",
        "MUTED": "#8FA2B8",
        "ACCENT": SUN,
        "HIGHLIGHT": "#5B8CFF",
        "POSITIVE": "#4CC26A",
        "NEGATIVE": CORAL,
    },
    "light": {
        "BG": PAPER,
        "TEXT": INK,
        "MUTED": "#5B6573",
        "ACCENT": BLUE,
        "HIGHLIGHT": "#E59A00",
        "POSITIVE": MINT,
        "NEGATIVE": "#D23A3A",
    },
}

THEME = os.environ.get("STUDIO_THEME", "dark")
_t = _THEMES.get(THEME, _THEMES["dark"])
BG = _t["BG"]
TEXT = _t["TEXT"]
MUTED = _t["MUTED"]
ACCENT = _t["ACCENT"]
HIGHLIGHT = _t["HIGHLIGHT"]
POSITIVE = _t["POSITIVE"]
NEGATIVE = _t["NEGATIVE"]


# Bundled (OFL) so videos look identical on every machine; Pango's generic
# "sans-serif" resolves to a serif face under conda's fontconfig.
FONT = "Nunito"


def apply_theme() -> None:
    """Background, default text colour and font; the runner calls this before the scene is built."""
    import manimpango

    manimpango.register_font(str(Path(__file__).parent / "fonts" / "Nunito[wght].ttf"))
    config.background_color = BG
    for cls in (Text, MarkupText, Paragraph):
        cls.set_default(color=TEXT, font=FONT)
    for cls in (Tex, MathTex):
        cls.set_default(color=TEXT)
