#!/usr/bin/env npx tsx
/**
 * Re-distill scanned PDF books using Gemini native PDF vision.
 *
 * The original distillation pipeline failed on scanned PDFs (0-2 avg chars/page)
 * because text extraction returned almost nothing. Gemini Pro handles scanned
 * PDFs natively via its vision capabilities — no separate OCR step needed.
 *
 * Strategy: Send chapter-sized batches (30-50 pages) to Gemini Pro for
 * extraction, then merge into the standard distillation format.
 *
 * Usage:
 *   npx tsx scripts/redistill-scanned-books.ts --help
 *   npx tsx scripts/redistill-scanned-books.ts --book norwood
 *   npx tsx scripts/redistill-scanned-books.ts --book ferris
 *   npx tsx scripts/redistill-scanned-books.ts --book norwood --pages 1-50
 *   npx tsx scripts/redistill-scanned-books.ts --book norwood --dry-run
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";

const WORKSPACE_ROOT = resolve(__dirname, "..");
const KNOWLEDGE_RAW = resolve(WORKSPACE_ROOT, "data/Knowledge/raw");
const DISTILLATION_DIR = resolve(WORKSPACE_ROOT, "data/Knowledge/distillations");
const TMP_DIR = resolve(WORKSPACE_ROOT, "data/Knowledge/tmp/gemini-redistill");

interface BookConfig {
  id: string;
  title: string;
  filename: string;
  totalPages: number;
  batchSize: number;
}

const BOOKS: Record<string, BookConfig> = {
  norwood: {
    id: "norwood",
    title: "Agricultural Marketing and Price Analysis (Norwood & Lusk)",
    filename: "Agricultural Marketing and Price Analysis (F. Bailey Norwood, Jayson L. Lusk) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
    totalPages: 233,
    batchSize: 40,
  },
  ferris: {
    id: "ferris",
    title: "Agricultural Prices and Commodity Market Analysis (Ferris)",
    filename: "AGRICULTURAL PRICES AND COMMODITY MARKET ANALYSIS (JOHN N.FERRIS, Ferris, John N. etc.) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
    totalPages: 377,
    batchSize: 35,
  },
};

const EXTRACTION_PROMPT = `You are distilling a scanned textbook on agricultural economics and grain marketing for use by a Canadian prairie farmer AI advisor.

Extract ALL actionable grain marketing knowledge from these pages. For each concept found, provide:

1. **Concept title** — a short descriptive heading
2. **Summary** — 2-3 sentences explaining the concept
3. **Farmer action** — what a western Canadian grain farmer should DO with this knowledge
4. **Specifics** — any numbers, thresholds, formulas, or rules mentioned
5. **Grain tags** — which grains/commodities this applies to (or "all" if general)
6. **Topic tags** — categorize as: basis, storage, hedging, logistics, market_structure, risk, pricing, quality, or policy

SKIP: biographical content, chapter introductions, exercises/problems, acknowledgments, table of contents, index pages, and purely theoretical proofs with no practical application.

Output as structured markdown with ## headings per concept. Be thorough — this is a scanned book so every piece of extracted knowledge matters.`;

const MERGE_PROMPT = `You are merging extracted knowledge from multiple batches of a grain marketing textbook.

Combine the following batch extractions into a single, coherent distillation. Rules:
- Deduplicate concepts that appear in multiple batches
- Preserve ALL specific numbers, thresholds, and formulas
- Keep the most actionable version of each concept
- Organize by topic (basis, storage, hedging, logistics, etc.)
- Output the final merged version as structured markdown

The output should have these sections:
## Executive Summary (3-5 sentences)
## Farmer Takeaways (bullet list, 8-15 items)
## Market Heuristics (### per heuristic with explanation)
## Risk Watchouts (bullet list)
## Grain Focus (list of relevant grains/commodities)
## Evidence Highlights (key specific quotes/numbers with page references)`;

function loadEnvLocal() {
  const envPath = resolve(WORKSPACE_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function callGeminiCli(prompt: string, pdfPath?: string): string {
  mkdirSync(TMP_DIR, { recursive: true });

  // Build the full prompt: @file reference (if any) + extraction instructions
  const fullPrompt = pdfPath
    ? `@${pdfPath.replace(/\\/g, "/")}\n\n${prompt}`
    : prompt;

  // Write to temp file, pipe via stdin with -p "" (empty -p tells Gemini to read stdin)
  // This is the same pattern used by distill-knowledge.ts
  const promptFile = resolve(TMP_DIR, `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  writeFileSync(promptFile, fullPrompt, "utf-8");

  console.error(`  Calling Gemini CLI (prompt: ${fullPrompt.length} chars)...`);

  const cmd = `cat "${promptFile.replace(/\\/g, "/")}" | gemini -p ""`;
  const result = spawnSync("bash", ["-c", cmd], {
    encoding: "utf-8",
    timeout: 300_000, // 5 min per batch
    maxBuffer: 10 * 1024 * 1024,
    cwd: resolve(__dirname, ".."),
  });

  // Clean up temp file
  try { require("fs").unlinkSync(promptFile); } catch { /* ignore */ }

  if (result.error) {
    throw new Error(`Gemini CLI error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Gemini CLI failed (exit ${result.status}): ${result.stderr?.slice(0, 500)}`);
  }

  return result.stdout?.trim() ?? "";
}

function generatePageRanges(totalPages: number, batchSize: number, pageFilter?: string): Array<{ start: number; end: number }> {
  if (pageFilter) {
    const [startStr, endStr] = pageFilter.split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : start;
    const ranges: Array<{ start: number; end: number }> = [];
    for (let s = start; s <= end; s += batchSize) {
      ranges.push({ start: s, end: Math.min(s + batchSize - 1, end) });
    }
    return ranges;
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (let s = 1; s <= totalPages; s += batchSize) {
    ranges.push({ start: s, end: Math.min(s + batchSize - 1, totalPages) });
  }
  return ranges;
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Re-distill Scanned Books via Gemini Native PDF Vision

Usage:
  npx tsx scripts/redistill-scanned-books.ts --book norwood
  npx tsx scripts/redistill-scanned-books.ts --book ferris
  npx tsx scripts/redistill-scanned-books.ts --book norwood --pages 1-50
  npx tsx scripts/redistill-scanned-books.ts --book norwood --dry-run

Options:
  --book <id>      Book to process: norwood or ferris (required)
  --pages <range>  Page range to process (e.g., 1-50, 100-150)
  --dry-run        Show batch plan without calling Gemini
  --help           Show this help

Books:
  norwood  — Agricultural Marketing & Price Analysis (233 pages, 40pp batches)
  ferris   — Agricultural Prices & Commodity Market Analysis (377 pages, 35pp batches)

Prerequisites:
  - Gemini CLI installed and authenticated (gemini -p works)
  - Source PDFs in data/Knowledge/raw/

The script sends chapter-sized PDF batches to Gemini Pro's native vision,
then merges batch results into the standard .distilled.md format.
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");
const bookArgIndex = args.indexOf("--book");
const pagesArgIndex = args.indexOf("--pages");

if (bookArgIndex === -1) {
  console.error("ERROR: --book is required. Use --help for usage.");
  process.exit(1);
}

const bookId = args[bookArgIndex + 1]?.toLowerCase();
const pageFilter = pagesArgIndex !== -1 ? args[pagesArgIndex + 1] : undefined;

if (!bookId || !BOOKS[bookId]) {
  console.error(`ERROR: Unknown book '${bookId}'. Available: ${Object.keys(BOOKS).join(", ")}`);
  process.exit(1);
}

loadEnvLocal();

const book = BOOKS[bookId];
const pdfPath = resolve(KNOWLEDGE_RAW, book.filename);

if (!existsSync(pdfPath)) {
  console.error(`ERROR: PDF not found at ${pdfPath}`);
  process.exit(1);
}

const ranges = generatePageRanges(book.totalPages, book.batchSize, pageFilter);

console.error(`=== Gemini Re-Distillation: ${book.title} ===`);
console.error(`PDF: ${pdfPath}`);
console.error(`Total pages: ${book.totalPages}`);
console.error(`Batches: ${ranges.length} (${book.batchSize} pages each)`);
console.error(`Page filter: ${pageFilter ?? "all"}`);
console.error();

if (DRY_RUN) {
  console.error("DRY RUN — batch plan:");
  for (const range of ranges) {
    console.error(`  Batch: pages ${range.start}-${range.end}`);
  }
  console.log(JSON.stringify({
    book: book.id,
    title: book.title,
    batches: ranges.length,
    ranges,
    dry_run: true,
  }, null, 2));
  process.exit(0);
}

async function main() {
  const batchOutputs: Array<{ range: { start: number; end: number }; content: string }> = [];

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    console.error(`\nBatch ${i + 1}/${ranges.length}: pages ${range.start}-${range.end}`);

    const batchPrompt = `${EXTRACTION_PROMPT}\n\nPlease process pages ${range.start} to ${range.end} of this PDF.`;

    try {
      const output = callGeminiCli(batchPrompt, pdfPath);
      batchOutputs.push({ range, content: output });
      console.error(`  OK — ${output.length} chars extracted`);

      // Save individual batch output
      mkdirSync(TMP_DIR, { recursive: true });
      const batchFile = resolve(TMP_DIR, `${book.id}-batch-${range.start}-${range.end}.md`);
      writeFileSync(batchFile, output, "utf-8");
      console.error(`  Saved to ${batchFile}`);
    } catch (err) {
      console.error(`  FAILED: ${String(err)}`);
      batchOutputs.push({ range, content: `[EXTRACTION FAILED: ${String(err)}]` });
    }
  }

  // Merge all batch outputs
  console.error(`\n=== Merging ${batchOutputs.length} batches ===`);
  const allBatchContent = batchOutputs
    .map((b) => `### Pages ${b.range.start}-${b.range.end}\n\n${b.content}`)
    .join("\n\n---\n\n");

  let mergedContent: string;
  if (batchOutputs.length === 1) {
    mergedContent = batchOutputs[0].content;
  } else {
    const mergeInput = `${MERGE_PROMPT}\n\n---\n\nBatch Extractions:\n\n${allBatchContent}`;
    mergedContent = callGeminiCli(mergeInput);
  }

  // Write final distilled output
  const timestamp = new Date().toISOString();
  const slug = `knowledge-redistilled-${book.id}`;
  const outputMd = resolve(DISTILLATION_DIR, `${slug}.distilled.md`);

  const finalMd = `# Distilled Grain Knowledge - ${book.title}

Source Title: ${book.title}
Source Path: ${pdfPath.replace(/\\/g, "/")}
Model Used: gemini-pro (native PDF vision)
Prompt Version: gemini-redistillation-v1
Generated At: ${timestamp}
Batch Count: ${batchOutputs.length}
Page Range: ${pageFilter ?? `1-${book.totalPages}`}
Extraction Method: Gemini native PDF vision (scanned book)

${mergedContent}
`;

  writeFileSync(outputMd, finalMd, "utf-8");
  console.error(`\nFinal output: ${outputMd}`);

  const summary = {
    book: book.id,
    title: book.title,
    timestamp,
    batches: batchOutputs.length,
    successful_batches: batchOutputs.filter((b) => !b.content.startsWith("[EXTRACTION FAILED")).length,
    total_chars: mergedContent.length,
    output_path: outputMd.replace(/\\/g, "/"),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`Fatal error: ${String(err)}`);
  process.exit(1);
});
