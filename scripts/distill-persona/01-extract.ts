#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.2 — Persona distillation Phase 1: text extraction
 *
 * Walks data/Knowledge/raw/Personality/ and writes a plain-text extraction
 * for each book to data/Knowledge/processed/Personality/{slug}.txt.
 *
 * - PDF → pdf-parse (pure JS; works on Windows without poppler)
 * - EPUB → epub2 (callback-based; wrapped in Promises here)
 *
 * Usage:
 *   npx tsx scripts/distill-persona/01-extract.ts [--help]
 *
 * Output: JSON summary to stdout, progress diagnostics to stderr.
 * Idempotent: re-running overwrites the output .txt files.
 *
 * Downstream: Phase 2 (02-chapters.ts) consumes these .txt files.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- pdf-parse ships CJS typings that need default-export interop
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { extname, resolve } from "path";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Phase 1 — Text Extraction

Usage:
  npx tsx scripts/distill-persona/01-extract.ts [--help]

Reads:
  data/Knowledge/raw/Personality/*.pdf|*.epub

Writes:
  data/Knowledge/processed/Personality/{slug}.txt

Slug rules:
  Lowercase dash-separated stem derived from "author-title". Examples:
    "How to Win Friends (Dale Carnegie) ... .pdf"
      -> carnegie-how-to-win-friends.txt
    "Never Split the Difference ... (Chris Voss, Tahl Raz) ....epub"
      -> voss-never-split-the-difference.txt

Idempotent: overwrites outputs on re-run. No LLM calls in this phase.
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..", "..");
const RAW_DIR = resolve(REPO_ROOT, "data", "Knowledge", "raw", "Personality");
const OUT_DIR = resolve(
  REPO_ROOT,
  "data",
  "Knowledge",
  "processed",
  "Personality",
);

// ---------------------------------------------------------------------------
// Slug mapping
// ---------------------------------------------------------------------------
//
// The raw filenames come from a torrent-style library (z-library) and embed
// "(z-library.sk, ...)" noise + inconsistent punctuation. Rather than a
// heuristic, we hand-map the four known books; re-running after adding a
// new book requires one line here. Keeps slugs stable across re-extractions.

type BookSlug =
  | "carnegie-how-to-win-friends"
  | "voss-never-split-the-difference"
  | "patterson-crucial-conversations"
  | "cabane-charisma-myth";

interface BookMapping {
  slug: BookSlug;
  /** Case-insensitive substring that uniquely identifies the raw filename. */
  match: string;
}

const BOOK_MAPPINGS: BookMapping[] = [
  { slug: "carnegie-how-to-win-friends", match: "how to win friends" },
  { slug: "voss-never-split-the-difference", match: "never split the difference" },
  { slug: "patterson-crucial-conversations", match: "crucial conversations" },
  { slug: "cabane-charisma-myth", match: "charisma myth" },
];

function slugForFile(filename: string): BookSlug | null {
  const lower = filename.toLowerCase();
  for (const mapping of BOOK_MAPPINGS) {
    if (lower.includes(mapping.match)) return mapping.slug;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extraction engines
// ---------------------------------------------------------------------------

async function extractPdf(filePath: string): Promise<string> {
  // pdf-parse v2 ships as an ESM-primary package with dynamic import in CJS.
  // tsx resolves `.` to the CJS entry which exposes a PDFParse class.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- tsx/CJS interop
  const mod = require("pdf-parse") as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ text: string }>;
      destroy(): Promise<void>;
    };
  };
  const data = readFileSync(filePath);
  const parser = new mod.PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function extractEpub(filePath: string): Promise<string> {
  // epub2's EPub is a CJS class that uses EventEmitter + callback chapter API.
  // We wrap both the parse lifecycle and per-chapter retrieval in promises.
  //
  // The module exports both a `.default` and a `.EPub` named export, both
  // pointing at the same constructor. Require the module as `unknown` and
  // narrow to the named export — `require("epub2")` itself is the namespace
  // object, not the constructor.
  type EPubInstance = {
    flow: Array<{ id: string; title?: string }>;
    on(event: "end", handler: () => void): void;
    on(event: "error", handler: (err: Error) => void): void;
    parse(): void;
    getChapter(
      chapterId: string,
      callback: (error: Error | null, text?: string) => void,
    ): void;
  };
  type EPubConstructor = new (
    filename: string,
    imageroot?: string,
    linkroot?: string,
  ) => EPubInstance;

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- epub2 CJS
  const mod = require("epub2") as {
    EPub: EPubConstructor;
    default: EPubConstructor;
  };
  const EPub = mod.EPub ?? mod.default;

  const epub = new EPub(filePath);

  await new Promise<void>((resolveParse, rejectParse) => {
    epub.on("end", resolveParse);
    epub.on("error", rejectParse);
    epub.parse();
  });

  const chapters: string[] = [];
  for (const entry of epub.flow) {
    const raw = await new Promise<string>((resolveChapter, rejectChapter) => {
      epub.getChapter(entry.id, (err, text) => {
        if (err) rejectChapter(err);
        else resolveChapter(text ?? "");
      });
    });
    chapters.push(stripHtml(raw));
  }

  return chapters.join("\n\n");
}

/** Lightweight HTML→plain-text. Avoids a regex-parser dependency; the
 * downstream LLM tolerates minor whitespace noise. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ExtractionResult {
  slug: BookSlug;
  source: string;
  output: string;
  charCount: number;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  let entries: string[];
  try {
    entries = readdirSync(RAW_DIR);
  } catch (err) {
    console.error(`ERROR: cannot read ${RAW_DIR}: ${String(err)}`);
    process.exit(1);
  }

  const results: ExtractionResult[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (ext !== ".pdf" && ext !== ".epub") {
      skipped.push({ file: entry, reason: "not-pdf-or-epub" });
      continue;
    }

    const slug = slugForFile(entry);
    if (!slug) {
      skipped.push({ file: entry, reason: "no-slug-mapping" });
      continue;
    }

    const sourcePath = resolve(RAW_DIR, entry);
    console.error(`[${slug}] extracting ${entry}...`);

    let text = "";
    try {
      if (ext === ".pdf") {
        text = await extractPdf(sourcePath);
      } else {
        text = await extractEpub(sourcePath);
      }
    } catch (err) {
      console.error(`  extract failed: ${String(err)}`);
      skipped.push({ file: entry, reason: `extract-error: ${String(err)}` });
      continue;
    }

    const outPath = resolve(OUT_DIR, `${slug}.txt`);
    writeFileSync(outPath, text, "utf-8");

    results.push({
      slug,
      source: entry,
      output: outPath.replaceAll("\\", "/"),
      charCount: text.length,
    });

    console.error(`  wrote ${text.length.toLocaleString()} chars to ${outPath}`);
  }

  const summary = {
    phase: 1,
    raw_dir: RAW_DIR.replaceAll("\\", "/"),
    out_dir: OUT_DIR.replaceAll("\\", "/"),
    extracted: results,
    skipped,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`Fatal: ${String(err)}`);
  process.exit(1);
});
