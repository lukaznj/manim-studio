---
status: accepted
date: 2026-10-14
---

# 0014 — PDFs as sources for a video

## Context

Teachers already have the material a video should explain: notes, worksheets, a textbook chapter, usually as PDFs. They want to hand one to Claude and get a video that follows it, and sometimes show the page itself (the exercise as printed, a figure).

Claude Code's Read tool opens a PDF in one of two ways. A small one goes to the model whole. Pages of a larger one need poppler's `pdftoppm`, which Windows and a stock Mac don't have; Claude then falls back to the whole file or fails. A textbook can't go into the context whole, and Studio doesn't install system tools ([[0003-python-env-via-pixi]]).

PDFs aren't media in the sense of [[0012-own-media-in-scenes]]. Media is what appears in the video; a PDF is what the video is about, and appears in it at most in part.

## Decision

- **Sources live in the project:** `<project>/sources/`, filled from a **Sources** tab next to `scene.py` and Media (drop or add PDFs), or by dropping a PDF on the chat box.
  - Files are copied in under tidy names. Remove moves a file to the Trash.
  - Each PDF is indexed once into `.studio/sources/<name>/`: `text.txt` (every page's text after a `=== Page N ===` line), `info.json` (pages, title, pages without a text layer, page sizes) and a thumbnail. A PDF newer than its index is indexed again.
- **pypdfium2 reads PDFs** (PDFium; Apache-2.0/BSD, prebuilt wheels for all four platforms), in the managed Python env, through the runner's `pdf-index` and `pdf-pages` commands. It needs no poppler. Existing installs get it on their next launch, when the app updates an outdated env.
- **Claude reads sources through two tools**, defined once in `src/shared/studio-tools.ts` for the in-app chat and Claude Desktop:
  - `read_source(source, from_page, to_page)`: page text with page markers, at most 60,000 characters per call. It names pages without a text layer.
  - `view_source_pages(source, pages)`: up to 4 pages as pictures, for figures, scans, handwriting and finding crops.
  - The in-app chat may also Grep `text.txt` to search a long PDF. Its Read tool refuses `.pdf` files and points at the two tools.
- **A message can carry a source:** "Make a video" on a PDF, or picking pages in its page view, attaches it (`ChatRequest.source`). Claude gets a note naming the PDF and the pages; the chat shows a chip.
- **Scenes show pages with `pdf_page("notes.pdf", 3, crop=(left, top, right, bottom))`** (`python/studio/sources.py`): an `ImageMobject` rendered sharp for the frame, scaled to the safe area. The crop is in fractions of the page from its top-left corner. "Show in video" in the page view inserts it.
- **History:** `sources/*.pdf` is ignored, like videos, because PDFs can be big and are inputs, not the video. The rule is added to older projects on their first import.

## Consequences

- Claude can work from a 300-page textbook without loading it: it reads the pages it needs, and looks at the ones whose meaning is in the picture.
- Formulas usually come out of a PDF's text layer garbled; Claude rebuilds them in `MathTex` from what it sees on the page.
- Restoring an old version doesn't bring back a deleted PDF, because PDFs aren't in the history.
- Only PDFs for now. Word documents or slides would need converting first; a scanned PDF works, but only through page pictures (no OCR).
