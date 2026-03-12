#!/usr/bin/env python
"""Render a PDF page range to PNG images and emit JSON metadata."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


DEFAULT_RENDER_SCALE = 1.35


def emit_error(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}))
    raise SystemExit(code)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) != 5:
        emit_error("Usage: render_pdf_pages.py <pdf_path> <output_dir> <start_page> <end_page>")

    pdf_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()

    try:
        start_page = int(sys.argv[3])
        end_page = int(sys.argv[4])
    except ValueError:
        emit_error("start_page and end_page must be integers")

    if not pdf_path.exists():
        emit_error(f"PDF not found: {pdf_path}")

    if start_page <= 0 or end_page < start_page:
        emit_error("Invalid page range")

    try:
        import fitz
    except ModuleNotFoundError:
        emit_error(
            "Missing dependency: pymupdf. Install with `python -m pip install -r scripts/requirements-knowledge.txt`.",
            code=2,
        )

    render_scale = float(os.environ.get("BUSHEL_KNOWLEDGE_VISION_RENDER_SCALE", str(DEFAULT_RENDER_SCALE)))
    output_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    if end_page > len(doc):
        emit_error(f"Requested end_page {end_page} exceeds PDF page count {len(doc)}")

    pages: list[dict[str, object]] = []

    for page_number in range(start_page, end_page + 1):
        page = doc[page_number - 1]
        pix = page.get_pixmap(matrix=fitz.Matrix(render_scale, render_scale), alpha=False)
        image_path = output_dir / f"page-{page_number:04d}.png"
        pix.save(image_path)
        pages.append({"page": page_number, "image_path": str(image_path)})

    print(
        json.dumps(
            {
                "pdf_path": str(pdf_path),
                "start_page": start_page,
                "end_page": end_page,
                "render_scale": render_scale,
                "pages": pages,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
