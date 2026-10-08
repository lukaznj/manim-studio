"""Cheap layout checks after every play(): things off the frame and text on text.

These are the two most common defects in generated manim code. A warning that holds
over consecutive clips becomes one time range."""

from __future__ import annotations

from manim import MathTex, Mobject, Paragraph, SingleStringMathTex, Text, config
from manim.mobject.text.text_mobject import MarkupText

TEXTY = (Text, MarkupText, Paragraph, SingleStringMathTex, MathTex)
EDGE_TOLERANCE = 0.05
OVERLAP_RATIO = 0.2


def describe(m: Mobject) -> str:
    for attr in ("original_text", "text", "tex_string"):
        value = getattr(m, attr, None)
        if isinstance(value, str) and value.strip():
            value = " ".join(value.split())
            return f'{type(m).__name__} "{value[:40]}"'
    return type(m).__name__


class LayoutChecker:
    def __init__(self) -> None:
        self.active: dict[tuple, dict] = {}
        self.done: list[dict] = []

    def check(self, scene, start: float, end: float, line: int | None) -> None:
        found = _find(scene)
        for key, message in found.items():
            if key in self.active:
                self.active[key]["end"] = end
            else:
                self.active[key] = {"kind": key[0], "message": message, "start": start, "end": end, "line": line}
        for key in [k for k in self.active if k not in found]:
            self.done.append(self.active.pop(key))

    def results(self) -> list[dict]:
        return sorted(self.done + list(self.active.values()), key=lambda w: w["start"])


def _find(scene) -> dict[tuple, str]:
    hw, hh = config.frame_width / 2, config.frame_height / 2
    found: dict[tuple, str] = {}

    for m in scene.mobjects:
        if not _visible(m):
            continue
        left, bottom, right, top = _box(m)
        if right - left >= 2 * hw * 0.98 and top - bottom >= 2 * hh * 0.98:
            continue  # a full-frame background
        t = EDGE_TOLERANCE
        if left < -hw - t or right > hw + t or bottom < -hh - t or top > hh + t:
            found[("offscreen", id(m))] = f"{describe(m)} izlazi izvan kadra"

    leaves: list[Mobject] = []
    for m in scene.mobjects:
        _text_leaves(m, leaves)
    leaves = [m for m in leaves if _visible(m)]
    boxes = [_box(m) for m in leaves]
    # ponytail: O(n²) over text leaves; scenes hold tens of them, not thousands.
    for i in range(len(leaves)):
        for j in range(i + 1, len(leaves)):
            a, b = boxes[i], boxes[j]
            w = min(a[2], b[2]) - max(a[0], b[0])
            h = min(a[3], b[3]) - max(a[1], b[1])
            if w <= 0 or h <= 0:
                continue
            smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
            if smaller > 1e-4 and w * h / smaller > OVERLAP_RATIO:
                key = ("overlap", id(leaves[i]), id(leaves[j]))
                found[key] = f"{describe(leaves[i])} preklapa {describe(leaves[j])}"
    return found


def _visible(m: Mobject) -> bool:
    for sub in m.get_family():
        if not sub.has_points():
            continue
        try:
            if sub.get_fill_opacity() > 0.05 or sub.get_stroke_opacity() > 0.05:
                return True
        except (AttributeError, TypeError, ValueError):
            return True
    return False


def _box(m: Mobject) -> tuple[float, float, float, float]:
    left, bottom = m.get_corner([-1, -1, 0])[:2]
    right, top = m.get_corner([1, 1, 0])[:2]
    return float(left), float(bottom), float(right), float(top)


def _text_leaves(m: Mobject, out: list[Mobject]) -> None:
    if isinstance(m, TEXTY):
        out.append(m)
        return
    for sub in m.submobjects:
        _text_leaves(sub, out)
