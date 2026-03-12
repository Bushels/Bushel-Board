#!/usr/bin/env python
"""Extract page text from a PDF as JSON for the knowledge ingestion script."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


MIN_CHARS_PER_PAGE_FOR_TEXT_EXTRACTION = 200
DEFAULT_OCR_RENDER_SCALE = 1.5


def emit_error(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}))
    raise SystemExit(code)


def should_use_ocr(pages: list[dict[str, object]]) -> bool:
    page_count = len(pages)
    total_chars = sum(len(str(page.get("text") or "").strip()) for page in pages)
    pages_with_text = sum(1 for page in pages if len(str(page.get("text") or "").strip()) >= 40)

    if page_count == 0:
        return False

    return total_chars < page_count * MIN_CHARS_PER_PAGE_FOR_TEXT_EXTRACTION or pages_with_text < max(3, page_count // 4)


def extract_with_ocr(pdf_path: Path, pages: list[dict[str, object]]) -> tuple[list[dict[str, object]], int]:
    try:
        import fitz
        import numpy as np
        from rapidocr_onnxruntime import RapidOCR
    except ModuleNotFoundError:
        return pages, 0

    doc = fitz.open(pdf_path)
    ocr = RapidOCR()
    ocr_pages: list[dict[str, object]] = []
    ocr_count = 0
    render_scale = float(os.environ.get("BUSHEL_KNOWLEDGE_OCR_RENDER_SCALE", str(DEFAULT_OCR_RENDER_SCALE)))

    for index, page in enumerate(doc, start=1):
        existing_text = str(pages[index - 1].get("text") or "")
        if len(existing_text.strip()) >= 80:
            ocr_pages.append({"page": index, "text": existing_text})
            continue

        pix = page.get_pixmap(matrix=fitz.Matrix(render_scale, render_scale), alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        result, _ = ocr(image)
        ocr_text = " ".join(line[1] for line in result) if result else ""
        ocr_pages.append({"page": index, "text": ocr_text or existing_text})
        if ocr_text.strip():
            ocr_count += 1

    return ocr_pages, ocr_count


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) != 2:
        emit_error("Usage: extract_pdf_text.py <pdf_path>")

    pdf_path = Path(sys.argv[1]).resolve()
    if not pdf_path.exists():
        emit_error(f"PDF not found: {pdf_path}")

    try:
        from pypdf import PdfReader
    except ModuleNotFoundError:
        emit_error(
            "Missing dependency: pypdf. Install with `python -m pip install -r scripts/requirements-knowledge.txt`.",
            code=2,
        )

    reader = PdfReader(str(pdf_path))
    pages = []

    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # pragma: no cover - defensive path
            emit_error(f"Failed to extract page {index} from {pdf_path.name}: {exc}")

        pages.append({"page": index, "text": text})

    ocr_used = False
    ocr_page_count = 0
    if os.environ.get("BUSHEL_KNOWLEDGE_ENABLE_OCR") == "1" and should_use_ocr(pages):
        pages, ocr_page_count = extract_with_ocr(pdf_path, pages)
        ocr_used = ocr_page_count > 0

    print(
      json.dumps(
        {
          "path": str(pdf_path),
          "page_count": len(pages),
          "ocr_used": ocr_used,
          "ocr_page_count": ocr_page_count,
          "pages": pages,
        },
        ensure_ascii=False,
      )
    )


if __name__ == "__main__":
    main()
