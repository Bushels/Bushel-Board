---
name: distill-knowledge
description: >
  Distill PDF/EPUB books into structured, tiered knowledge for AI systems.
  Use when the user says: 'distill the books', 'run the knowledge pipeline', 'extract knowledge',
  'add a new book', 'redistill', 'update the knowledge base', 'process the PDFs',
  'check distillation status', 'improve OCR', 'rescanned books', 'knowledge quality',
  'distill this PDF', 'extract from EPUB', 'build knowledge corpus', or references
  knowledge extraction from documents. Also use when discussing knowledge quality,
  tiered context (L0/L1/L2), or re-distillation of scanned/OCR books.
  Do NOT use for: querying existing knowledge (use grain-report skill), importing CGC data
  (use cgc-import skill), or deploying Edge Functions (use supabase-deploy skill).
---

# Knowledge Distillation Skill

Distill raw PDF/EPUB documents into structured, tiered knowledge for AI systems. Produces L0/L1/L2 summaries optimized for token-efficient context injection.

This skill works both for **Bushel Board** (grain marketing knowledge) and as a **general-purpose** distillation framework for any domain.

## Core Concepts

### Tiered Knowledge Architecture (L0/L1/L2)

| Tier | Size | Purpose | Loading Strategy |
|------|------|---------|-----------------|
| **L0** | ~30 words per book, ~420 tokens unified | One-sentence essence / always-loaded worldview card | Always in context |
| **L1** | ~750-850 tokens per topic | Cross-book topic summaries loaded by intent detection | Regex pattern matching on user query |
| **L2** | Full distilled chunks | Specific passages retrieved by search (RPC, vector, or FTS) | Query-time retrieval |

**Why tiered?** A flat knowledge blob wastes tokens on irrelevant context. Tiered loading gives the AI precise domain knowledge at ~2K tokens instead of 7K+ static blobs, while covering more source material.

### When to Use Each Engine

| Engine | Best For | How |
|--------|----------|-----|
| **Gemini Pro (native PDF vision)** | Scanned books, image-heavy PDFs, OCR-poor sources | Send chapter-sized batches (30-50 pages) directly to Gemini — no separate OCR step needed |
| **Gemini Flash** | Clean text PDFs, EPUBs, quick factual extraction | Faster and cheaper, good when text extraction yields >1500 avg chars/page |
| **OpenRouter (Step 3.5 Flash)** | Bulk distillation of clean-text books | Free tier, auto-retry with fallback models |
| **Gemini CLI** | Bypassing OpenRouter rate limits | Uses Google OAuth quota, `--engine gemini` flag |

## Folder Structure (Bushel Board)

```
data/Knowledge/
  raw/              # Source PDFs and EPUBs (gitignored)
  distillations/    # Output .distilled.md + .distilled.json (tracked)
  tmp/              # Temp renders for vision rescue (gitignored)
```

For other projects, adapt paths via environment variables or `--dir` flag.

## Commands (Bushel Board)

```bash
# Distill all books
npm run distill-knowledge

# Distill a specific book
npm run distill-knowledge -- --match "traders first book"

# Use Gemini CLI engine (bypasses OpenRouter limits)
npm run distill-knowledge -- --engine gemini --match "merchants" --force

# Dry run — extract + packetize only, no LLM calls
npm run distill-knowledge -- --dry-run

# Force re-distill even if hash unchanged
npm run distill-knowledge -- --force

# Enable vision rescue for scanned PDFs
npm run distill-knowledge -- --match "ferris" --allow-low-yield
```

## Distillation Pipeline

```
Source Document (PDF/EPUB/MD)
  1. Text Extraction
     ├─ Clean PDF → PyMuPDF → pypdf fallback
     ├─ Scanned PDF → Gemini native PDF vision (preferred) or OCR rescue
     └─ EPUB → extractEpubChapters()
  2. Quality Assessment
     ├─ Measure avg chars/page
     ├─ Flag if <200 avg chars/page (likely scanned)
     └─ Route to appropriate engine
  3. Packetization (24K char chunks)
  4. Per-Packet LLM Distillation → structured JSON
  5. Batched Merge (groups of 10 → final merge)
  6. L0/L1/L2 Summary Generation
  7. Quality Scoring (see rubric below)
  8. Output: .distilled.md + .distilled.json
```

## Gemini Native PDF Vision (for Scanned Books)

For scanned PDFs where text extraction yields <200 avg chars/page, Gemini Pro's native PDF vision is the best path. It handles OCR internally with high accuracy.

### How to Use — Gemini CLI Direct (Recommended)

The Gemini CLI reads scanned PDFs natively via vision. **Critical:** Files in `.gitignore`-listed directories are blocked by the CLI. The distillation script copies chunks to `~/tmp-gemini-distill/` to bypass this.

```bash
# Automated batch distillation (splits PDF, processes all chunks, merges)
python scripts/gemini-ocr-distill.py --book norwood
python scripts/gemini-ocr-distill.py --book ferris

# Test with a small page range first
python scripts/gemini-ocr-distill.py --test  # pages 13-22 of Norwood

# Process specific pages
python scripts/gemini-ocr-distill.py --book norwood --pages 41-80

# Dry run (show batch plan)
python scripts/gemini-ocr-distill.py --book norwood --dry-run
```

**Performance:** ~100s per 40-page batch. Norwood (233 pages) ≈ 12 min. Ferris (377 pages) ≈ 20 min.

**Caching:** Individual batch results are cached in `data/Knowledge/tmp/gemini-ocr/`. If a batch was already extracted, it skips re-processing. Delete the cache file to force re-extraction.

### Manual Single-Chunk Extraction

For ad-hoc extraction or testing, copy the PDF outside gitignored directories and pipe to Gemini CLI:

```bash
# Copy to home dir (not gitignored)
cp "data/Knowledge/raw/book.pdf" ~/tmp-book-test.pdf

# Extract via Gemini CLI
cd ~ && echo "Extract all actionable knowledge. For each concept: ## Title, Summary, Farmer Action, Specifics, Tags." | gemini -p "@tmp-book-test.pdf"
```

### Scanned Book Inventory (Bushel Board)

| Book | Pages | Avg chars/pg | Status |
|------|-------|-------------|--------|
| Agricultural Prices & Commodity Market Analysis (Ferris) | 377 | 2 (scanned) | Re-distilling via Gemini vision |
| Agricultural Marketing & Price Analysis (Norwood/Lusk) | 233 | 0 (scanned) | Re-distilling via Gemini vision |

### Re-Distillation Workflow

When re-distilling a book that was previously processed with poor OCR:

1. **Assess current quality** — read the existing `.distilled.md` and score against the rubric
2. **Run automated distillation** — `python scripts/gemini-ocr-distill.py --book <id>`
3. **Review batch cache** — check individual batch outputs in `data/Knowledge/tmp/gemini-ocr/`
4. **Compare outputs** — check that the new extraction captures concepts the old one missed
5. **Quality score** — apply the rubric and compare to previous score
6. **Update Viking L1** — if new knowledge fills gaps in existing L1 topics, update both `viking-l1.ts` files

### Gitignore Workaround for Gemini CLI

The Gemini CLI respects `.gitignore` patterns and refuses to read files in ignored directories. Since `data/Knowledge/` is gitignored (copyrighted source material), the distillation script:
1. Splits the PDF into chunks using PyMuPDF
2. Copies chunks to `~/tmp-gemini-distill/<book-id>/` (outside any git repo)
3. Runs Gemini CLI from that directory where @ file references work
4. Cleans up temp files after completion

## Quality Scoring Rubric

Score each distilled book section 1-5 on these **5 weighted dimensions**:

| Dimension | Weight | 1 (Poor) | 3 (Adequate) | 5 (Excellent) |
|-----------|--------|----------|--------------|---------------|
| **Accuracy** | 25% | Factual errors, wrong numbers | Mostly correct, minor gaps | All specs verified, no errors |
| **Decision Utility** | 30% | Generic advice, no specifics | Some actionable rules with numbers | Clear decision triggers with thresholds that map to farm actions (haul/hold/price) |
| **Completeness** | 15% | Major topics missing | Core topics covered | Comprehensive with edge cases |
| **Signal Coherence** | 20% | No guidance on conflicting signals | Acknowledges tradeoffs exist | Explicit rules for resolving conflicting signals (e.g., "when basis says X but carry says Y, weight Z") |
| **Risk Awareness** | 10% | No danger flags or caveats | Mentions some risks | Flags edge cases, when NOT to act, and speculation traps |

### Why These Dimensions

- **Decision Utility** (30%) is weighted highest because it directly measures "can a farmer make a better haul/hold/price decision from this?" It merges actionability + specificity + farmer relevance into one discriminating metric.
- **Signal Coherence** (20%) catches the gap where knowledge helps the AI resolve conflicting market signals. Without it, the AI gets paralyzed when basis says sell but carry spread says hold.
- **Risk Awareness** (10%) is lower-weighted but critical for safety — the knowledge should flag when holding is speculation, when liquidity risk exists, and when NOT to act.

### Composite Score

Weighted score = (Accuracy × 0.25) + (Decision Utility × 0.30) + (Completeness × 0.15) + (Signal Coherence × 0.20) + (Risk Awareness × 0.10)

**Thresholds:**
- **≥ 4.0** — Production ready, inject into Viking L1
- **3.0–3.9** — Acceptable but flag gaps for next re-distillation round
- **< 3.0** — Re-distill with better source material or different engine

### Quality Checklist for Grain Knowledge

When reviewing distilled grain knowledge, verify these are present:

- [ ] Quality specs with specific thresholds (protein %, VKC %, test weight, oil content)
- [ ] Price impact of quality variations ($/tonne premiums and discounts)
- [ ] Hedging contract specs (exchange, contract size, relevant months)
- [ ] Storage risk factors specific to the crop
- [ ] Demand drivers (domestic vs export, processor vs terminal)
- [ ] Competing crops in rotation and acreage dynamics
- [ ] Basis behavior patterns (seasonal, locational)
- [ ] Government program interactions (cash advances, crop insurance)

### Cross-Model Review Protocol

After distillation, use a different model to review quality:

1. Send the distilled output to Gemini (via `ask-gemini`) with this prompt pattern:
   ```
   Review this [domain] knowledge summary for a [user persona] AI advisor.
   Score each section 1-5 for: (1) accuracy of specs, (2) actionability,
   (3) missing critical details. Flag any factual errors.
   ```
2. Fix any flagged errors immediately in both source files
3. Note gaps for future re-distillation rounds

## Extraction Quality Reference

### Good Text Extraction (>1500 avg chars/page)
These can use any engine (OpenRouter, Gemini Flash, Gemini CLI):
- A Trader's First Book on Commodities (2035 avg/pg)
- Introduction to Grain Marketing (2358 avg/pg)
- Merchants of Grain (1882 avg/pg)
- The Economics of Futures Trading (2510 avg/pg)
- Self-Study Guide: Hedging (2634 avg/pg)

### Needs Vision Rescue (<200 avg chars/page)
These MUST use Gemini Pro native PDF vision:
- Agricultural Prices & Commodity Market Analysis — Ferris (2 avg/pg)
- Agricultural Marketing & Price Analysis — Norwood (0 avg/pg)

### EPUB
- Out of the Shadows — Kingsman (EPUB format, uses `extractEpubChapters()`)

## General-Purpose Adaptation

To use this skill for a non-grain domain:

### 1. Define Your Tiered Architecture
```
L0: What is the ONE thing the AI must always know? (~30 words per source)
L1: What are the 5-8 topic areas? What regex patterns trigger each?
L2: How will specific chunks be retrieved? (FTS, vector search, keyword)
```

### 2. Customize the Distillation Prompt
Replace the grain-specific extraction prompt with your domain:
```
Extract all [DOMAIN] knowledge from this text. For each concept:
1. A 2-3 sentence summary
2. Why it matters for [USER PERSONA]'s decision
3. Any specific numbers, thresholds, or rules
4. Which [DOMAIN CATEGORIES] it applies to
```

### 3. Build Your Quality Checklist
Every domain has "must-have" knowledge categories. For grain marketing, it's quality specs + hedging + basis. For medical: symptoms + dosages + contraindications. For legal: statutes + precedents + jurisdictions.

### 4. Wire Into Your AI System
- **Always-loaded context**: Inject L0 into every system prompt
- **Intent-loaded context**: Match user queries to L1 topics via regex
- **Query-specific context**: Retrieve L2 chunks via search at query time

## Key Scripts (Bushel Board)

| Script | Purpose |
|--------|---------|
| `scripts/gemini-ocr-distill.py` | **Scanned PDF distillation** via Gemini CLI native vision (split → extract → merge) |
| `scripts/distill-knowledge.ts` | Main distillation engine (clean-text PDFs/EPUBs) |
| `scripts/split_pdf.py` | Split large PDFs into page-range chunks for batch processing |
| `scripts/extract_pdf_text.py` | PDF text extraction (PyMuPDF + pypdf + OCR) |
| `scripts/extract_epub_text.py` | EPUB chapter extraction |
| `scripts/render_pdf_pages.py` | Render PDF pages to images for vision path |
| `scripts/knowledge-lib.ts` | Shared utilities: chunking, file discovery, hashing |
| `scripts/ingest-knowledge.ts` | Ingest distilled output into Supabase |

## Integration Points (Bushel Board)

After distillation, knowledge feeds into:
- `lib/knowledge/viking-l0.ts` — Unified L0 knowledge card (always loaded)
- `lib/knowledge/viking-l1.ts` — 7 cross-book L1 topic summaries (intent-loaded)
- `lib/knowledge/viking-retrieval.ts` — L0+L1+L2 retrieval orchestration
- `supabase/functions/_shared/viking-knowledge.ts` — Deno copy for Edge Functions
- `lib/advisor/context-builder.ts` — Advisor chat context assembly

**Dual-module pattern**: Next.js `lib/` and Deno Edge Functions can't share imports. After updating Viking L1 content, always sync both:
1. `lib/knowledge/viking-l1.ts` (Next.js)
2. `supabase/functions/_shared/viking-knowledge.ts` (Deno — self-contained copy)

## Lessons Learned (2026-03-20 Distillation Sprint)

### Scanned Book Pipeline — What Works
1. **Gemini CLI native vision is the answer for scanned PDFs.** No OCR layer needed. Send 35-40 page PDF chunks directly and it reads them natively. ~100-290s per batch depending on density.
2. **Batch size sweet spot: 35-40 pages.** Smaller batches (10-20) waste overhead. Larger (50+) hit timeouts or produce less focused output.
3. **Caching is essential.** Individual batch results cached in `data/Knowledge/tmp/gemini-ocr/`. Failed batches can be retried without re-processing successful ones. Full re-runs with `--book` use all cached results and only call Gemini for missing/failed batches.
4. **429 rate limits are transient.** "No capacity available" errors resolve in 10-30 minutes. Just re-run the failed page range later.
5. **Batch 1 and final batches often yield [NO_ACTIONABLE_CONTENT].** Title pages, index, acknowledgments, exercises. The pipeline filters these before merge — this is expected, not a failure.

### Scanned Book Pipeline — What Failed
1. **Gemini MCP `ask-gemini` tool cannot process PDFs.** It returned placeholder "How can I help?" responses. Use `scripts/gemini-ocr-distill.py` CLI approach instead.
2. **`.geminiignore` does NOT override `.gitignore`.** Gemini CLI still respects `.gitignore` even with negation patterns. The ONLY workaround is copying PDFs to `~/tmp-gemini-distill/` (outside any git repo).
3. **Google AI SDK auth fails on Windows.** `google-generativeai` SDK returned 503 reauthentication errors. Vertex AI approach failed with project ID issues. Stick with Gemini CLI pipe method.
4. **Gemini CLI can leak internal monologue.** Occasionally outputs "Done. Goodbye. Fin." stream-of-consciousness text. The pipe-from-file approach (`cat prompt.txt | gemini -p ""`) is more reliable than inline prompts.

### Template Literal Gotcha
When embedding distilled knowledge into TypeScript template literals (`` ` `` strings), markdown backticks inside the content (like `` `formula` ``) prematurely terminate the string. **Always strip or replace inner backticks** before adding to L1 constants. The AI consumer doesn't render markdown, so plain text formulas work fine.

### Viking L1 Folding Process
1. Read the distilled `.distilled.md` output and identify new concepts not already in L1
2. Edit `lib/knowledge/viking-l1.ts` — add new subsections to the relevant topic
3. **Immediately sync** `supabase/functions/_shared/viking-knowledge.ts` with identical content
4. Run `npm run build` to verify no template literal parsing errors
5. Use Gemini (`ask-gemini`) to score the updated L1 topics against the quality rubric

### Quality Scores (Gemini Review, 2026-03-20)
| Topic | Score |
|-------|-------|
| basis_pricing | 4.9 |
| storage_carry | 4.85 |
| hedging_contracts | 4.85 |
| logistics_exports | 4.35 |
| market_structure | 4.6 |
| risk_management | 5.0 |
| grain_specifics | 5.0 |
| **Overall** | **4.79** |

Weakest area: `logistics_exports` — could add ocean freight/FOB-CIF detail and weather-related rail risks.

### L2 Retrieval Status
- RPC `get_knowledge_context()` exists and is wired into advisor chat
- **knowledge_chunks table needs population** via `npm run ingest-knowledge`
- Without L2, system gracefully degrades to L0+L1 (~1,170 tokens per query)
- With L2, adds 1-3 specific passages (~200-400 additional tokens)

## Troubleshooting

### Low text yield warnings
Book triggers `low_text_yield_for_source_size` → likely scanned PDF. Use Gemini Pro native PDF vision instead of text extraction.

### Rate limiting (OpenRouter)
Free models have rate limits. Pipeline auto-retries 3x with 15s delays, then falls back to `healer-alpha`. Or switch to `--engine gemini`.

### Gemini CLI rate limits (429)
"No capacity available for model" — transient. Wait 10-30 minutes and retry. The batch caching means you only re-process the failed batch, not the whole book.

### Gemini CLI on Windows
Gemini CLI uses `gemini -p` with stdin piping. Prompts are written to temp files to avoid Windows command-line length limits. The pipe approach (`cat file.txt | gemini -p ""`) is more reliable than inline prompts.

### Gitignore blocking Gemini CLI
`data/Knowledge/` is gitignored. Gemini CLI refuses to read files in ignored directories. `.geminiignore` negation patterns do NOT work. Workaround: copy to `~/tmp-gemini-distill/` (outside any git repo). The `gemini-ocr-distill.py` script does this automatically.

### Template literal parsing errors after L1 update
If `npm run build` fails with "Expected ',', got 'ident'" in viking-l1.ts, check for unescaped backticks inside the template literal strings. Remove or replace inner backticks with plain text.

### Verification after distillation
```bash
# Count sections in distilled output
grep -c "^##" data/Knowledge/distillations/*.distilled.md

# Verify batch cache for scanned books
ls -la data/Knowledge/tmp/gemini-ocr/

# Test L2 retrieval RPC
# SELECT * FROM get_knowledge_context('wheat storage basis', 'Wheat', ARRAY['storage', 'basis'], 3);

# Check knowledge_chunks population
# SELECT COUNT(*) FROM knowledge_chunks;
```

## Playbook: Adding a New Book

### Clean-text PDF/EPUB
```bash
# 1. Place in data/Knowledge/raw/
# 2. Run distillation
npm run distill-knowledge -- --match "book name" --engine gemini

# 3. Review output
cat data/Knowledge/distillations/knowledge-*.distilled.md

# 4. Score against rubric (use Gemini)
# 5. Fold best insights into viking-l1.ts
# 6. Sync to viking-knowledge.ts (Deno)
# 7. Build verify: npm run build
# 8. Ingest for L2: npm run ingest-knowledge
```

### Scanned PDF (< 200 avg chars/page)
```bash
# 1. Place in data/Knowledge/raw/
# 2. Add to BOOKS dict in scripts/gemini-ocr-distill.py
# 3. Test with small range first
python scripts/gemini-ocr-distill.py --book newbook --pages 1-40

# 4. If quality good, run full book
python scripts/gemini-ocr-distill.py --book newbook

# 5. If any batch fails (429), retry just that range
python scripts/gemini-ocr-distill.py --book newbook --pages 281-315

# 6. Re-run full book to merge all cached batches
python scripts/gemini-ocr-distill.py --book newbook

# 7. Score, fold into L1, sync Deno, build verify, ingest
```
