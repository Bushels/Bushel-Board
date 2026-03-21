#!/usr/bin/env python3
"""
Distill scanned PDF books using Gemini CLI native PDF vision.

Splits PDFs into chunks, copies to a non-gitignored location, then
calls the Gemini CLI which handles vision OCR natively on scanned PDFs.

Usage:
    python scripts/gemini-ocr-distill.py --help
    python scripts/gemini-ocr-distill.py --test           # Test with pages 13-22 of Norwood
    python scripts/gemini-ocr-distill.py --book norwood    # Full distillation
    python scripts/gemini-ocr-distill.py --book ferris     # Full distillation
    python scripts/gemini-ocr-distill.py --book norwood --pages 41-80
    python scripts/gemini-ocr-distill.py --book norwood --dry-run

Output: JSON summary to stdout, diagnostics to stderr.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: PyMuPDF not installed. Run: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

WORKSPACE_ROOT = Path(__file__).parent.parent
KNOWLEDGE_RAW = WORKSPACE_ROOT / "data" / "Knowledge" / "raw"
DISTILLATION_DIR = WORKSPACE_ROOT / "data" / "Knowledge" / "distillations"
CACHE_DIR = WORKSPACE_ROOT / "data" / "Knowledge" / "tmp" / "gemini-ocr"
# Gemini CLI respects .gitignore, so we copy PDFs here (outside any git repo)
GEMINI_WORK_DIR = Path.home() / "tmp-gemini-distill"

BOOKS = {
    "norwood": {
        "title": "Agricultural Marketing and Price Analysis (Norwood & Lusk)",
        "filename": "Agricultural Marketing and Price Analysis (F. Bailey Norwood, Jayson L. Lusk) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
        "total_pages": 233,
        "batch_size": 40,  # 40 pages per Gemini CLI call
    },
    "ferris": {
        "title": "Agricultural Prices and Commodity Market Analysis (Ferris)",
        "filename": "AGRICULTURAL PRICES AND COMMODITY MARKET ANALYSIS (JOHN N.FERRIS, Ferris, John N. etc.) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
        "total_pages": 377,
        "batch_size": 35,
    },
}

EXTRACTION_PROMPT = """You are distilling a scanned agricultural economics textbook for a Canadian prairie farmer AI advisor.

Extract ALL actionable grain marketing knowledge from these pages. For each concept:

## [Concept Title]
**Summary:** 2-3 sentences
**Farmer Action:** What a western Canadian grain farmer should DO
**Specifics:** Numbers, thresholds, formulas, rules (if any)
**Grain Tags:** Which commodities (or "all")
**Topic Tags:** basis | storage | hedging | logistics | market_structure | risk | pricing | quality | policy

SKIP: table of contents, exercises, biographical content, index pages, acknowledgments, purely theoretical proofs.
If these pages contain no actionable content (e.g., just title pages or exercises), output: [NO_ACTIONABLE_CONTENT]

Be thorough and specific. Every number, formula, and decision rule matters."""

MERGE_PROMPT = """Merge these extracted knowledge batches into a single coherent distillation for a Canadian prairie grain farmer AI advisor.

Rules:
- Deduplicate concepts appearing in multiple batches
- Preserve ALL specific numbers, thresholds, and formulas
- Keep the most actionable version of each concept
- Organize by topic

Output format:
## Executive Summary (3-5 sentences about what this book teaches farmers)
## Farmer Takeaways (8-15 bullets — the most actionable insights)
## Market Heuristics (### per heuristic with explanation + specifics)
## Risk Watchouts (bullet list of dangers and pitfalls)
## Grain Focus (list of relevant grains/commodities covered)
## Evidence Highlights (key quotes/numbers with page references)
## Retrieval Tags
- Topic Tags: [comma-separated tags for search indexing]
- Region Tags: [regions covered]"""


def split_pdf(pdf_path: str, output_dir: Path, batch_size: int, start: int = 1, end: int = None) -> list[dict]:
    """Split a PDF into page-range chunks."""
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    if end is None:
        end = total_pages

    chunks = []
    for batch_start in range(start - 1, min(end, total_pages), batch_size):
        batch_end = min(batch_start + batch_size, end, total_pages)
        chunk_doc = fitz.open()
        chunk_doc.insert_pdf(doc, from_page=batch_start, to_page=batch_end - 1)

        filename = f"chunk-{batch_start + 1:03d}-{batch_end:03d}.pdf"
        output_path = output_dir / filename
        chunk_doc.save(str(output_path))
        chunk_doc.close()

        chunks.append({
            "filename": filename,
            "path": str(output_path),
            "start_page": batch_start + 1,
            "end_page": batch_end,
            "page_count": batch_end - batch_start,
            "size_bytes": output_path.stat().st_size,
        })
        print(f"  Split: {filename} ({batch_end - batch_start} pages, {output_path.stat().st_size / 1024 / 1024:.1f} MB)", file=sys.stderr)

    doc.close()
    return chunks


def call_gemini_cli(prompt: str, pdf_path: str, timeout_sec: int = 300) -> str:
    """Call Gemini CLI with a PDF file and extraction prompt.

    The PDF must be in a non-gitignored location for Gemini CLI to read it.
    """
    # Build the command: pipe prompt via stdin, reference PDF with @
    full_prompt = f"@{pdf_path}\n\n{prompt}"

    # Write prompt to a temp file and pipe it
    prompt_file = GEMINI_WORK_DIR / f"prompt-{int(time.time())}.txt"
    prompt_file.write_text(full_prompt, encoding="utf-8")

    cmd = f'cat "{str(prompt_file).replace(chr(92), "/")}" | gemini -p ""'
    result = subprocess.run(
        ["bash", "-c", cmd],
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        cwd=str(GEMINI_WORK_DIR),  # Run from the work dir so @ paths resolve
    )

    # Clean up prompt file
    try:
        prompt_file.unlink()
    except OSError:
        pass

    if result.returncode != 0:
        raise RuntimeError(f"Gemini CLI failed (exit {result.returncode}): {result.stderr[:500]}")

    # Gemini CLI outputs to stdout, but may include loading messages in stderr
    output = result.stdout.strip()
    if not output:
        raise RuntimeError(f"Empty Gemini output. stderr: {result.stderr[:500]}")

    return output


def main():
    parser = argparse.ArgumentParser(
        description="Distill scanned PDFs via Gemini CLI native PDF vision",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Books:
  norwood  — Agricultural Marketing & Price Analysis (233 pages)
  ferris   — Agricultural Prices & Commodity Market Analysis (377 pages)

Prerequisites:
  - Gemini CLI installed and authenticated (gemini -p works)
  - PyMuPDF installed (pip install pymupdf)
  - Source PDFs in data/Knowledge/raw/
"""
    )
    parser.add_argument("--book", choices=list(BOOKS.keys()), help="Book to process")
    parser.add_argument("--pages", type=str, help="Page range (e.g., 1-40, 41-80)")
    parser.add_argument("--test", action="store_true", help="Test with pages 13-22 of Norwood")
    parser.add_argument("--dry-run", action="store_true", help="Show batch plan only")
    parser.add_argument("--timeout", type=int, default=300, help="Timeout per batch in seconds (default: 300)")
    args = parser.parse_args()

    if args.test:
        args.book = "norwood"
        args.pages = "13-22"

    if not args.book:
        parser.print_help()
        sys.exit(1)

    book = BOOKS[args.book]
    pdf_path = str(KNOWLEDGE_RAW / book["filename"])

    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    # Parse page range
    if args.pages:
        parts = args.pages.split("-")
        start = int(parts[0])
        end = int(parts[1]) if len(parts) > 1 else start
    else:
        start = 1
        end = book["total_pages"]

    batch_size = book["batch_size"]

    # Calculate batches
    batches = []
    for s in range(start, end + 1, batch_size):
        e = min(s + batch_size - 1, end)
        batches.append((s, e))

    print(f"=== Gemini OCR Distillation: {book['title']} ===", file=sys.stderr)
    print(f"Pages: {start}-{end} ({end - start + 1} pages)", file=sys.stderr)
    print(f"Batches: {len(batches)} ({batch_size} pages each)", file=sys.stderr)
    print(f"Timeout: {args.timeout}s per batch", file=sys.stderr)
    print(file=sys.stderr)

    if args.dry_run:
        for i, (s, e) in enumerate(batches):
            print(f"  Batch {i+1}: pages {s}-{e}", file=sys.stderr)
        print(json.dumps({"book": args.book, "batches": len(batches), "dry_run": True}, indent=2))
        sys.exit(0)

    # Set up work directories
    GEMINI_WORK_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DISTILLATION_DIR.mkdir(parents=True, exist_ok=True)

    # Split PDF into chunks and copy to non-gitignored location
    print("Splitting PDF into chunks...", file=sys.stderr)
    chunks = split_pdf(pdf_path, GEMINI_WORK_DIR / args.book, batch_size, start, end)

    # Process each chunk
    batch_results = []
    for i, chunk in enumerate(chunks):
        batch_start = chunk["start_page"]
        batch_end = chunk["end_page"]
        print(f"\nBatch {i+1}/{len(chunks)}: pages {batch_start}-{batch_end}", file=sys.stderr)

        # Check for cached result
        cache_file = CACHE_DIR / f"{args.book}-pages-{batch_start:03d}-{batch_end:03d}.md"
        if cache_file.exists():
            cached = cache_file.read_text(encoding="utf-8")
            if len(cached) > 100 and "[EXTRACTION FAILED" not in cached:
                print(f"  Using cached result ({len(cached)} chars)", file=sys.stderr)
                batch_results.append({"start": batch_start, "end": batch_end, "content": cached})
                continue

        # Call Gemini CLI
        prompt = f'{EXTRACTION_PROMPT}\n\nThese are pages {batch_start}-{batch_end} from "{book["title"]}".'
        print(f"  Calling Gemini CLI...", file=sys.stderr)

        try:
            t0 = time.time()
            content = call_gemini_cli(prompt, chunk["path"], timeout_sec=args.timeout)
            elapsed = time.time() - t0
            print(f"  OK — {len(content)} chars in {elapsed:.1f}s", file=sys.stderr)

            # Cache the result
            cache_file.write_text(content, encoding="utf-8")
            batch_results.append({"start": batch_start, "end": batch_end, "content": content})

        except Exception as e:
            print(f"  FAILED: {e}", file=sys.stderr)
            batch_results.append({"start": batch_start, "end": batch_end, "content": f"[EXTRACTION FAILED: {e}]"})

        # Brief pause between batches
        if i < len(chunks) - 1:
            time.sleep(2)

    # Merge results
    successful = [b for b in batch_results if not b["content"].startswith("[EXTRACTION FAILED")]
    actionable = [b for b in successful if "[NO_ACTIONABLE_CONTENT]" not in b["content"]]

    print(f"\n=== Results ===", file=sys.stderr)
    print(f"Total batches: {len(batch_results)}", file=sys.stderr)
    print(f"Successful: {len(successful)}", file=sys.stderr)
    print(f"Actionable: {len(actionable)}", file=sys.stderr)

    if len(actionable) > 1:
        # Merge via Gemini CLI (text-only, no PDF)
        print(f"\nMerging {len(actionable)} batches via Gemini...", file=sys.stderr)
        all_content = "\n\n---\n\n".join(
            f"### Pages {b['start']}-{b['end']}\n\n{b['content']}" for b in actionable
        )
        merge_input = f"{MERGE_PROMPT}\n\n---\n\nBatch Extractions:\n\n{all_content}"

        merge_file = GEMINI_WORK_DIR / "merge-prompt.txt"
        merge_file.write_text(merge_input, encoding="utf-8")

        try:
            cmd = f'cat "{str(merge_file).replace(chr(92), "/")}" | gemini -p ""'
            result = subprocess.run(
                ["bash", "-c", cmd],
                capture_output=True, text=True,
                timeout=args.timeout,
                cwd=str(GEMINI_WORK_DIR),
            )
            if result.returncode == 0 and result.stdout.strip():
                merged = result.stdout.strip()
                print(f"  Merged: {len(merged)} chars", file=sys.stderr)
            else:
                print(f"  Merge failed, concatenating instead", file=sys.stderr)
                merged = all_content
        except Exception as e:
            print(f"  Merge error: {e}, concatenating instead", file=sys.stderr)
            merged = all_content

        try:
            merge_file.unlink()
        except OSError:
            pass
    elif len(actionable) == 1:
        merged = actionable[0]["content"]
    else:
        merged = "[NO CONTENT EXTRACTED]"

    # Write final output
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S")
    slug = f"knowledge-redistilled-{args.book}"
    output_path = DISTILLATION_DIR / f"{slug}.distilled.md"

    final_md = f"""# Distilled Grain Knowledge - {book['title']}

Source Title: {book['title']}
Source Path: {pdf_path.replace(chr(92), '/')}
Model Used: Gemini CLI (native PDF vision)
Prompt Version: gemini-ocr-distill-v2
Generated At: {timestamp}
Batch Count: {len(batch_results)}
Successful Batches: {len(successful)}
Actionable Batches: {len(actionable)}
Page Range: {start}-{end}
Extraction Method: Gemini CLI native PDF vision (scanned book OCR)

{merged}
"""

    output_path.write_text(final_md, encoding="utf-8")
    print(f"\nOutput: {output_path}", file=sys.stderr)

    # Clean up work directory
    try:
        shutil.rmtree(GEMINI_WORK_DIR / args.book, ignore_errors=True)
    except OSError:
        pass

    # JSON summary to stdout
    print(json.dumps({
        "book": args.book,
        "title": book["title"],
        "timestamp": timestamp,
        "batches_total": len(batch_results),
        "batches_successful": len(successful),
        "batches_actionable": len(actionable),
        "merged_chars": len(merged),
        "output_path": str(output_path).replace("\\", "/"),
    }, indent=2))


if __name__ == "__main__":
    main()
