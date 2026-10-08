"""Which timeline clips can be retimed by editing a literal in scene.py.

For a clip produced by `self.play(...)` or `self.wait(...)` on a known line, find the
call and return the source span of its duration literal (or where to insert one).
Anything computed (`run_time=v.duration`, helper functions, `**kwargs`) is locked:
the timeline shows why, and the user asks Claude instead.

Lines are 1-based, columns 0-based *characters* (ast gives UTF-8 byte offsets, which
drift on lines with non-ASCII letters, like č or é, before the literal)."""

from __future__ import annotations

import ast
from collections import Counter


def annotate(source: str, clips: list[dict]) -> None:
    """Adds `edit` or `locked` (and `repeat`) to each clip in place."""
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        for clip in clips:
            clip["locked"] = "syntax"
        return

    calls: dict[int, list[ast.Call]] = {}
    special: dict[int, str] = {}
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        name = node.func.attr
        if name in ("play", "wait"):
            calls.setdefault(node.lineno, []).append(node)
        elif name == "voiceover":
            special[node.lineno] = "voiceover"
        elif name in ("wait_until_bookmark", "wait_for_voiceover"):
            special[node.lineno] = "bookmark"

    for clip in clips:
        line = clip.get("line")
        want = "wait" if clip["kind"] == "wait" else "play"
        nodes = [n for n in calls.get(line, []) if n.func.attr == want]
        if len(nodes) != 1:
            clip["locked"] = special.get(line) or ("helper" if not nodes else "ambiguous")
            continue
        edit, locked = _edit_for(nodes[0], lines)
        if edit:
            clip["edit"] = edit
        else:
            clip["locked"] = locked

    spans = Counter(_span_id(c["edit"]) for c in clips if "edit" in c)
    for clip in clips:
        if "edit" in clip:
            clip["repeat"] = spans[_span_id(clip["edit"])]


def _span_id(edit: dict) -> tuple:
    return (edit["line"], edit["col"])


def _edit_for(node: ast.Call, lines: list[str]) -> tuple[dict | None, str | None]:
    if any(k.arg is None for k in node.keywords):
        return None, "kwargs"

    if node.func.attr == "wait":
        arg = node.args[0] if node.args else _kw(node, "duration")
        if arg is None:
            # self.wait() -> self.wait(<value>), right before the closing paren.
            line, col = node.end_lineno, node.end_col_offset - 1
            return _span(lines, line, col, line, col, None, ""), None
    else:
        arg = _kw(node, "run_time")
        if arg is None:
            parts = node.args + [k.value for k in node.keywords]
            if not parts:
                return None, "empty"
            last = parts[-1]
            # After the last argument, so a trailing comma or newline stays valid.
            line, col = last.end_lineno, last.end_col_offset
            return _span(lines, line, col, line, col, None, ", run_time="), None

    if isinstance(arg, ast.Constant) and isinstance(arg.value, (int, float)) and not isinstance(arg.value, bool):
        return _span(lines, arg.lineno, arg.col_offset, arg.end_lineno, arg.end_col_offset, float(arg.value), ""), None
    return None, "computed:" + ast.unparse(arg)


def _kw(node: ast.Call, name: str) -> ast.expr | None:
    return next((k.value for k in node.keywords if k.arg == name), None)


def _span(lines, line, col, end_line, end_col, value, prefix) -> dict:
    return {
        "line": line,
        "col": _chars(lines[line - 1], col),
        "endLine": end_line,
        "endCol": _chars(lines[end_line - 1], end_col),
        "value": value,
        "prefix": prefix,
    }


def _chars(line: str, byte_col: int) -> int:
    return len(line.encode("utf-8")[:byte_col].decode("utf-8", "ignore"))
