"""Machine-readable lines on stdout for the app. manim's own logging goes to the same
streams, so ours carry a prefix and everything else is shown as plain log."""

import json
import sys

PREFIX = "@@studio "


def emit(type_: str, **data) -> None:
    sys.__stdout__.write(PREFIX + json.dumps({"type": type_, **data}, ensure_ascii=False) + "\n")
    sys.__stdout__.flush()
