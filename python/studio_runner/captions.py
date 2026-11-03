"""Maths in subtitles (ADR 0063) as plain text, for subtitle files and burned-in subtitles.

Subtitles keep LaTeX between $…$, which the app draws with KaTeX. No player, YouTube or libass
renders LaTeX, so .srt/.vtt files and burned-in text get the closest Unicode: τ ≪ Tₚ, x², a/b.
"""

import re

SYMBOLS = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ",
    "eta": "η", "theta": "θ", "vartheta": "ϑ", "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν",
    "xi": "ξ", "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "upsilon": "υ", "phi": "φ", "varphi": "φ",
    "chi": "χ", "psi": "ψ", "omega": "ω", "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ",
    "Pi": "Π", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
    "gg": "≫", "ll": "≪", "approx": "≈", "sim": "∼", "neq": "≠", "ne": "≠", "leq": "≤", "le": "≤", "geq": "≥",
    "ge": "≥", "pm": "±", "mp": "∓", "times": "×", "cdot": "·", "div": "÷", "infty": "∞", "partial": "∂",
    "nabla": "∇", "sum": "∑", "prod": "∏", "int": "∫", "to": "→", "rightarrow": "→", "leftarrow": "←",
    "Rightarrow": "⇒", "Leftrightarrow": "⇔", "in": "∈", "notin": "∉", "subset": "⊂", "cup": "∪", "cap": "∩",
    "forall": "∀", "exists": "∃", "degree": "°", "circ": "°", "angle": "∠", "perp": "⊥", "parallel": "∥",
    "propto": "∝", "equiv": "≡", "ldots": "…", "dots": "…", "cdots": "⋯", "%": "%", "{": "{", "}": "}",
    "sin": "sin", "cos": "cos", "tan": "tan", "log": "log", "ln": "ln", "exp": "exp", "lim": "lim",
    "max": "max", "min": "min",
}
SUPER = dict(zip("0123456789+-=()niax", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵃˣ"))
SUB = dict(zip("0123456789+-=()aehijklmnoprstuvx", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ"))
MATH = re.compile(r"\$([^$\n]+)\$")


def _group(s: str, i: int) -> tuple[str, int]:
    """The argument at s[i]: a {…} group (nested) or one character. Returns it and the index after."""
    if i < len(s) and s[i] == "{":
        depth = 0
        for j in range(i, len(s)):
            depth += {"{": 1, "}": -1}.get(s[j], 0)
            if depth == 0:
                return s[i + 1:j], j + 1
        return s[i + 1:], len(s)
    return s[i:i + 1], i + 1


def _script(text: str, table: dict[str, str], mark: str) -> str:
    # All of it as Unicode scripts when they exist; capital subscripts don't, so lower case stands in.
    flat = text if mark == "^" else text.lower()
    return "".join(table[c] for c in flat) if all(c in table for c in flat) else f"{mark}{text}" if len(text) == 1 else f"{mark}({text})"


def tex(s: str) -> str:
    """One formula, without its $…$, as plain text."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == "\\":
            m = re.match(r"\\([A-Za-z]+|.)", s[i:])
            name = m.group(1)
            i += len(m.group(0))
            if name == "frac":
                num, i = _group(s, i)
                den, i = _group(s, i)
                num, den = tex(num), tex(den)
                out.append(f"{num if len(num) == 1 else f'({num})'}/{den if len(den) == 1 else f'({den})'}")
            elif name == "sqrt":
                arg, i = _group(s, i)
                arg = tex(arg)
                out.append(f"√{arg if len(arg) == 1 else f'({arg})'}")
            elif name in ("text", "mathrm", "mathbf", "mathit", "operatorname", "textrm", "mathsf"):
                arg, i = _group(s, i)
                out.append(tex(arg) if name != "text" and name != "textrm" else arg)
            elif name in (",", ";", ":", " ", "quad", "qquad"):
                out.append(" " if name in (",", ";", ":") else " ")
            elif name in ("left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "!"):
                pass
            else:
                out.append(SYMBOLS.get(name, name))
        elif c in "^_":
            arg, i = _group(s, i + 1)
            out.append(_script(tex(arg), SUPER if c == "^" else SUB, c))
        elif c in "{}":
            i += 1
        else:
            out.append(c)
            i += 1
    return re.sub(r"[ \t\n]+", " ", "".join(out)).strip()  # a thin space (\,) stays unbreakable


def plain(text: str) -> str:
    """A subtitle with its $…$ maths written out: 'za $\\tau \\ll T_P$' → 'za τ ≪ Tₚ'."""
    return MATH.sub(lambda m: tex(m.group(1)), text)
