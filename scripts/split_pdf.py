#!/usr/bin/env python3
"""Split a PDF into page-range chunks for Gemini re-distillation.

Usage:
    python scripts/split_pdf.py <input.pdf> <output_dir> <batch_size>
    python scripts/split_pdf.py "data/Knowledge/raw/book.pdf" "data/Knowledge/tmp/chunks" 40

Outputs:
    <output_dir>/chunk-001-040.pdf
    <output_dir>/chunk-041-080.pdf
    ...

Prints JSON summary to stdout.
"""

import json
import os
import sys

import fitz  # PyMuPDF


def split_pdf(input_path: str, output_dir: str, batch_size: int) -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(input_path)
    total_pages = len(doc)
    chunks = []

    for start in range(0, total_pages, batch_size):
        end = min(start + batch_size, total_pages)
        chunk_doc = fitz.open()  # new empty PDF
        chunk_doc.insert_pdf(doc, from_page=start, to_page=end - 1)

        filename = f"chunk-{start + 1:03d}-{end:03d}.pdf"
        output_path = os.path.join(output_dir, filename)
        chunk_doc.save(output_path)
        chunk_doc.close()

        file_size = os.path.getsize(output_path)
        chunks.append({
            "filename": filename,
            "path": output_path.replace("\\", "/"),
            "start_page": start + 1,
            "end_page": end,
            "page_count": end - start,
            "size_bytes": file_size,
        })
        print(f"  {filename} ({end - start} pages, {file_size / 1024 / 1024:.1f} MB)", file=sys.stderr)

    doc.close()
    return chunks


if __name__ == "__main__":
    if len(sys.argv) < 4 or "--help" in sys.argv:
        print("Usage: python scripts/split_pdf.py <input.pdf> <output_dir> <batch_size>", file=sys.stderr)
        sys.exit(0 if "--help" in sys.argv else 1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    batch_size = int(sys.argv[3])

    if not os.path.exists(input_path):
        print(f"ERROR: {input_path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Splitting {input_path} into {batch_size}-page chunks...", file=sys.stderr)
    chunks = split_pdf(input_path, output_dir, batch_size)
    print(json.dumps({"total_pages": sum(c["page_count"] for c in chunks), "chunks": chunks}, indent=2))
