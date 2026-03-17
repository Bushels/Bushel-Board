---
name: distill-knowledge
description: >
  Distill PDF/EPUB books into structured grain knowledge for the Bushel Board AI pipeline.
  Use when the user says: 'distill the books', 'run the knowledge pipeline', 'extract knowledge',
  'add a new book', 'redistill', 'update the knowledge base', 'process the PDFs',
  'check distillation status', or references knowledge extraction from books.
  Do NOT use for: querying existing knowledge (use grain-report skill), importing CGC data
  (use cgc-import skill), or deploying Edge Functions (use supabase-deploy skill).
---

# Knowledge Distillation Skill — Bushel Board

Distill raw PDF/EPUB books into structured grain marketing knowledge with L0/L1/L2 tiered summaries.

## Folder Structure

```
data/Knowledge/
  raw/          # Source PDFs and EPUBs (gitignored — large copyrighted files)
  distillations/ # Output .distilled.md + .distilled.json (tracked in git)
  tmp/          # Temp renders for vision rescue (gitignored)
```

## Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/distill-knowledge.ts` | Main distillation engine — packetize, LLM distill, merge, generate L0/L1/L2 |
| `scripts/extract_pdf_text.py` | PDF text extraction (PyMuPDF primary, pypdf fallback, OCR rescue) |
| `scripts/knowledge-lib.ts` | Shared utilities: chunking, file discovery, text normalization |
| `scripts/render_pdf_pages.py` | Render PDF pages to images for vision rescue path |

## Commands

```bash
# Distill all books (uses Step 3.5 Flash by default)
npm run distill-knowledge

# Distill a specific book
npm run distill-knowledge -- --match "traders first book"

# Use a different model (e.g., Gemini 2.0 Flash for narrative books)
npm run distill-knowledge -- --match "merchants" --model google/gemini-2.0-flash-001

# Dry run — extract + packetize only, no LLM calls
npm run distill-knowledge -- --dry-run

# Force re-distill even if source hash hasn't changed
npm run distill-knowledge -- --force

# Process only the first N books
npm run distill-knowledge -- --limit 1

# Enable vision rescue for scanned PDFs (Ferris, Norwood textbooks)
npm run distill-knowledge -- --match "ferris" --allow-low-yield

# Use Gemini CLI instead of OpenRouter (bypasses rate limits, uses Google OAuth quota)
npm run distill-knowledge -- --engine gemini

# Gemini + specific book
npm run distill-knowledge -- --engine gemini --match "merchants" --force
```

## Engine Selection Guide

| Engine | Flag | Quota | Best For |
|--------|------|-------|----------|
| OpenRouter (default) | (default) | 50 free requests/day | Quick single-book distillations |
| Gemini CLI | `--engine gemini` | Google OAuth (generous) | Bulk distillation, bypassing OpenRouter limits |

## Model Selection Guide (OpenRouter engine only)

| Book Type | Recommended Model | Flag |
|-----------|------------------|------|
| All books (default) | `stepfun/step-3.5-flash:free` | (default, auto-retries with fallback to healer-alpha) |
| Alternative free model | `openrouter/healer-alpha` | `--model openrouter/healer-alpha` |
| Scanned PDFs (Ferris, Norwood) | Vision rescue path | `--allow-low-yield` |

**Rate limit handling (OpenRouter)**: The pipeline automatically retries 3 times with 15s delays, then falls back to `openrouter/healer-alpha` if the primary model is rate-limited.

**Gemini CLI**: Uses `gemini -p` with stdin piping to avoid Windows command-line length limits. Prompts are written to temp files under `data/Knowledge/tmp/gemini-prompts/` and cleaned up after each call. ~1 min per packet, ~19 min per book.

## Extraction Quality Reference

Books with good text extraction (>1500 avg chars/page):
- A Trader's First Book on Commodities (2035 avg/pg)
- Introduction to Grain Marketing (2358 avg/pg)
- Merchants of Grain (1882 avg/pg)
- The Economics of Futures Trading (2510 avg/pg)
- Self-Study Guide: Hedging (2634 avg/pg)

Books needing vision rescue (scanned PDFs, <200 avg chars/page):
- Agricultural Prices & Commodity Market Analysis — Ferris (2 avg/pg)
- Agricultural Marketing & Price Analysis — Norwood (0 avg/pg)

EPUB support:
- Out of the Shadows — Kingsman (EPUB format, uses `extractEpubChapters()`)

## Pipeline Architecture

```
Raw Book (PDF/EPUB)
  → Text Extraction (PyMuPDF → pypdf → OCR rescue)
  → Packetization (24K char chunks)
  → Per-Packet LLM Distillation (farmer-focused JSON)
  → Batched LLM Merge (groups of 10 packets → final merge)
  → L0/L1/L2 Summary Generation
  → Output: .distilled.md + .distilled.json
```

### L0/L1/L2 Tiered Summaries

| Tier | Size | Purpose |
|------|------|---------|
| L0 | ~30 words | One-sentence essence for retrieval ranking |
| L1 | ~150 words | 3-5 bullet points for context loading |
| L2 | Full distillation | Complete .distilled.md content |

## Troubleshooting

### Low text yield warnings
If a book triggers `low_text_yield_for_source_size`, it's likely a scanned PDF. Use `--allow-low-yield` to enable the vision rescue path (sends page images to a vision model).

### Rate limiting
Free OpenRouter models have rate limits. If you hit 429 errors, wait a few minutes or switch models. The script will retry automatically.

### Verification after distillation
Check the output quality:
```bash
# Count sections in distilled output
grep -c "^##" data/Knowledge/distillations/*.distilled.md

# Check L0/L1 summaries were generated
grep "^## L0" data/Knowledge/distillations/*.distilled.md
grep "^## L1" data/Knowledge/distillations/*.distilled.md

# Compare packet counts (more = deeper extraction)
grep "Packet Count:" data/Knowledge/distillations/*.distilled.md
```

## Integration with AI Pipeline

Distilled knowledge feeds into the advisor chat and intelligence generation:
- `lib/advisor/knowledge-retrieval.ts` — retrieves relevant distilled knowledge for chat
- `supabase/functions/_shared/commodity-knowledge.ts` — static trading framework (hand-curated)
- `supabase/functions/generate-intelligence/prompt-template.ts` — includes retrieved knowledge in prompts
