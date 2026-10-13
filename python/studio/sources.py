"""PDF pages in a scene: the PDFs in the project's sources/ folder, which the app's Sources panel
adds (ADR 0014). `pdf_page("notes.pdf", 3)` shows page 3; `crop=` shows part of it, such as one
exercise or figure."""

import os
from pathlib import Path

import numpy as np
from manim import ImageMobject, config


def source_path(name: str) -> str:
    """The absolute path of a PDF in sources/, or an error that lists what is there."""
    folder = Path(os.environ.get("STUDIO_PROJECT", ".")) / "sources"
    path = folder / name
    if not path.is_file():
        there = sorted(p.name for p in folder.glob("*.pdf")) if folder.is_dir() else []
        raise FileNotFoundError(f'No source "{name}". In sources/: {", ".join(there) or "nothing yet"}')
    return str(path)


def pdf_page(name: str, page: int, crop: tuple[float, float, float, float] | None = None) -> ImageMobject:
    """Page `page` (1-based) of sources/<name> as a picture, scaled down to fit the safe area.

    crop=(left, top, right, bottom) keeps only that part of the page, as fractions of its width
    and height from the top-left corner: crop=(0, 0.5, 1, 1) is the bottom half."""
    import pypdfium2 as pdfium

    from . import fit  # here, not at the top: studio/__init__ imports this module

    left, top, right, bottom = crop or (0, 0, 1, 1)
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        raise ValueError(f"crop={crop}: use (left, top, right, bottom) fractions between 0 and 1, left < right and top < bottom")
    doc = pdfium.PdfDocument(source_path(name))
    try:
        if not 1 <= page <= len(doc):
            raise ValueError(f"{name} has {len(doc)} pages; there is no page {page}")
        sheet = doc[page - 1]
        w, h = sheet.get_size()
        # Enough pixels for the shown part to stay sharp at full frame height, within a sane limit.
        scale = min(config.pixel_height * 1.25 / (h * (bottom - top)), 6000 / max(w, h))
        pixels = np.array(sheet.render(scale=scale).to_pil().convert("RGBA"))
    finally:
        doc.close()  # an open PDF is locked on Windows: the app couldn't trash or replace it
    ph, pw = pixels.shape[:2]
    pixels = pixels[round(top * ph) : round(bottom * ph), round(left * pw) : round(right * pw)]
    return fit(ImageMobject(pixels))
