#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.3 — Persona distillation Phase 2: chapter summaries (Sonnet)
 *
 * For each extracted {book}.txt under data/Knowledge/processed/Personality/,
 * call Claude Sonnet 4.6 with a structured prompt that emits a JSON
 * chapter breakdown:
 *   { chapters: [
 *       { title, key_principles[], memorable_examples[], specific_scripts[] }
 *   ] }
 *
 * The prompt stresses verbatim preservation of directly-applicable phrasing
 * (Voss: "How am I supposed to do that?"; Carnegie: name-use examples; etc.)
 * because downstream Opus verification will check for them.
 *
 * Usage:
 *   npx tsx scripts/distill-persona/02-chapters.ts [--book <slug>] [--help]
 *
 * Reads:  data/Knowledge/processed/Personality/{book}.txt
 * Writes: data/Knowledge/processed/Personality/{book}-chapters.json
 *
 * Estimated cost: ~$0.50/book → ~$2 for all four books. Requires
 * ANTHROPIC_API_KEY in .env.local (quoted values are stripped).
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Config (used by --help below and by the main flow)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..", "..");
const PROCESSED_DIR = resolve(
  REPO_ROOT,
  "data",
  "Knowledge",
  "processed",
  "Personality",
);

// Pinned model ID. Sonnet 4.6 is the right tier for chapter-level summary:
// cheap enough to run on four books, smart enough to preserve verbatim
// scripts. Opus 4.7 is reserved for Phase 5 verification.
const MODEL_ID = "claude-sonnet-4.6";
const MAX_OUTPUT_TOKENS = 8000;

const BOOK_SLUGS = [
  "carnegie-how-to-win-friends",
  "voss-never-split-the-difference",
  "patterson-crucial-conversations",
  "cabane-charisma-myth",
] as const;
type BookSlug = (typeof BOOK_SLUGS)[number];

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Phase 2 — Chapter Summaries (Sonnet)

Usage:
  npx tsx scripts/distill-persona/02-chapters.ts            Process all books
  npx tsx scripts/distill-persona/02-chapters.ts --book <slug>  One book
  npx tsx scripts/distill-persona/02-chapters.ts --help

Book slugs:
  carnegie-how-to-win-friends
  voss-never-split-the-difference
  patterson-crucial-conversations
  cabane-charisma-myth

Reads:  data/Knowledge/processed/Personality/{slug}.txt
Writes: data/Knowledge/processed/Personality/{slug}-chapters.json

Env vars (.env.local):
  ANTHROPIC_API_KEY

Model: ${MODEL_ID}
Cost:  ~$0.50/book
`);
  process.exit(0);
}

const bookArgIndex = args.indexOf("--book");
const bookFilter = bookArgIndex !== -1 ? args[bookArgIndex + 1] : null;

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes (single or double) — same pattern as
      // seed-weather-stations.ts fix from commit b23d258.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* .env.local may not exist */
  }
}

loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You distill personality and communication books into structured chapter summaries for an AI assistant ("Bushy") that talks to Canadian prairie grain farmers. Your job is to preserve the *specific, usable phrasing* each author teaches — not to paraphrase it away.

Critical rules:
- Preserve exact wording for directly-applicable scripts. Examples:
    * Chris Voss: "How am I supposed to do that?" — quote verbatim
    * Dale Carnegie: name-use phrases, "make them feel important" — quote verbatim
    * Patterson: "I know you probably think X, but actually Y" contrast patterns — quote verbatim
    * Cabane: pause-and-presence scripts — quote verbatim
- Do not substitute corporate language. Forbidden words in your output: "leverage", "stakeholder", "engagement", "circle back".
- If a chapter mixes conceptual framing with a script, keep the script verbatim under specific_scripts and put the framing under key_principles.
- Memorable examples are case studies, anecdotes, or named stories the author uses. Keep them short (one line) but specific (names, numbers if given).
- Output JSON only — no prose, no markdown fences.`;

function buildUserPrompt(slug: BookSlug, bookText: string): string {
  const titleHint: Record<BookSlug, string> = {
    "carnegie-how-to-win-friends":
      'How to Win Friends and Influence People — Dale Carnegie',
    "voss-never-split-the-difference":
      'Never Split the Difference — Chris Voss with Tahl Raz',
    "patterson-crucial-conversations":
      'Crucial Conversations — Patterson, Grenny, McMillan, Switzler',
    "cabane-charisma-myth": 'The Charisma Myth — Olivia Fox Cabane',
  };

  return `Book: ${titleHint[slug]}

Identify the chapters of this book and produce a JSON summary. Exact shape:

{
  "book_title": "string",
  "book_author": "string",
  "chapters": [
    {
      "title": "string — chapter name as the author uses it",
      "key_principles": ["string — one line per principle, in the author's voice"],
      "memorable_examples": ["string — anecdotes, named stories, case studies"],
      "specific_scripts": ["string — verbatim quotes of directly applicable phrasing"]
    }
  ]
}

Rules recap:
- 10-20 chapters typical; do not invent structure if the book does not have chapters (e.g. Voss has chapter-like "techniques"). In that case use the author's own unit of division.
- specific_scripts MUST be verbatim where the author provides a phrase the reader is supposed to say. Do not paraphrase.
- Do not use "leverage", "stakeholder", "engagement", "circle back" anywhere in output.
- Output JSON only.

Book text (may include headers, TOC noise, endnotes — use your judgement):

${bookText}`;
}

// ---------------------------------------------------------------------------
// Anthropic call
// ---------------------------------------------------------------------------

interface ChapterSummary {
  title: string;
  key_principles: string[];
  memorable_examples: string[];
  specific_scripts: string[];
}

interface BookChapters {
  book_title: string;
  book_author: string;
  chapters: ChapterSummary[];
}

async function summarizeBook(
  client: Anthropic,
  slug: BookSlug,
  bookText: string,
): Promise<BookChapters> {
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(slug, bookText) }],
  });

  // Concatenate all text blocks — Anthropic returns the JSON as one
  // text block when we don't stream tool calls. Using the SDK's discriminant
  // directly (block.type === "text") narrows without re-declaring the type.
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");

  const parsed = extractJson(text);
  return parsed as BookChapters;
}

/** Tolerates Sonnet occasionally wrapping the JSON in ```json fences. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error(
      `Sonnet response did not contain a JSON object. First 200 chars: ${trimmed.slice(0, 200)}`,
    );
  }
  return JSON.parse(trimmed.slice(first, last + 1));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set in .env.local.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  mkdirSync(PROCESSED_DIR, { recursive: true });

  const slugs: BookSlug[] = bookFilter
    ? BOOK_SLUGS.filter((s) => s === bookFilter)
    : [...BOOK_SLUGS];

  if (slugs.length === 0) {
    console.error(
      `ERROR: --book ${bookFilter} not recognized. Valid slugs: ${BOOK_SLUGS.join(", ")}`,
    );
    process.exit(1);
  }

  const results: Array<{
    slug: BookSlug;
    output: string;
    chapterCount: number;
  }> = [];

  for (const slug of slugs) {
    const sourcePath = resolve(PROCESSED_DIR, `${slug}.txt`);
    if (!existsSync(sourcePath)) {
      console.error(`[${slug}] SKIP — missing ${sourcePath}. Run Phase 1 first.`);
      continue;
    }

    const bookText = readFileSync(sourcePath, "utf-8");
    console.error(`[${slug}] summarizing (${bookText.length.toLocaleString()} chars)...`);

    let chapters: BookChapters;
    try {
      chapters = await summarizeBook(client, slug, bookText);
    } catch (err) {
      console.error(`  Sonnet call failed: ${String(err)}`);
      process.exit(1);
    }

    const outPath = resolve(PROCESSED_DIR, `${slug}-chapters.json`);
    writeFileSync(outPath, JSON.stringify(chapters, null, 2), "utf-8");

    const chapterCount = chapters.chapters?.length ?? 0;
    console.error(`  wrote ${chapterCount} chapters to ${outPath}`);
    results.push({
      slug,
      output: outPath.replaceAll("\\", "/"),
      chapterCount,
    });
  }

  console.log(
    JSON.stringify(
      {
        phase: 2,
        model: MODEL_ID,
        processed: results,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(`Fatal: ${String(err)}`);
  process.exit(1);
});
