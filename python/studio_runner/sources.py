"""PDF sources (ADR 0014): the project's sources/ folder holds PDFs that the video is made from.
The app indexes each one once (page text with page markers, page sizes, a thumbnail) and renders
page images on demand, for its Sources panel and for Claude, which can't open PDF pages itself
without poppler."""

from __future__ import annotations

import json
from pathlib import Path

PAGE_MARK = "=== Page {} ==="


def _open(pdf: str | Path):
    import pypdfium2 as pdfium

    return pdfium.PdfDocument(str(pdf))


def index(pdf: Path, out_dir: Path) -> dict:
    """Writes out_dir/text.txt (every page's text after a "=== Page N ===" line), info.json and
    thumb.png (page 1, 320 px wide). Returns the info."""
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = _open(pdf)
    chunks: list[str] = []
    empty: list[int] = []
    sizes: list[list[float]] = []
    for i in range(len(doc)):
        page = doc[i]
        sizes.append([round(v, 1) for v in page.get_size()])
        text = page.get_textpage().get_text_range().replace("\r\n", "\n").replace("\r", "\n").strip()
        if not text:
            empty.append(i + 1)
        chunks.append(f"{PAGE_MARK.format(i + 1)}\n{text}\n")
    (out_dir / "text.txt").write_text("\n".join(chunks), encoding="utf-8")
    title = (doc.get_metadata_dict().get("Title") or "").strip()
    info = {"pages": len(doc), "title": title, "noText": empty, "sizes": sizes}
    (out_dir / "info.json").write_text(json.dumps(info), encoding="utf-8")
    if len(doc):
        _render(doc[0], 320).save(out_dir / "thumb.png")
    return info


def pages(pdf: Path, out_dir: Path, numbers: list[int], width: int) -> list[str]:
    """Renders the given pages (1-based) to out_dir/page-<n>-<width>.png, reusing ones already there."""
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = None
    outs = []
    for n in numbers:
        out = out_dir / f"page-{n}-{width}.png"
        if not out.exists():
            doc = doc or _open(pdf)
            if not 1 <= n <= len(doc):
                raise ValueError(f"{pdf.name} has {len(doc)} pages; there is no page {n}")
            _render(doc[n - 1], width).save(out)
        outs.append(str(out))
    return outs


def _render(page, width: int):
    """A page as a PIL image `width` pixels wide, on white (PDF pages are paper)."""
    return page.render(scale=width / page.get_size()[0]).to_pil().convert("RGB")
