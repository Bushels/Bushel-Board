#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.7 — Persona distillation Phase 6: TS + DB emission
 *
 * Reads the Phase-4 L0 draft and the Phase-3 topic chunks, overwrites the
 * placeholder TS files in lib/bushy/persona/, and INSERTs paragraph-level
 * chunks into the persona_chunks Supabase table.
 *
 * Files written (ONLY when this script is executed — not as part of any
 * commit):
 *   lib/bushy/persona/persona-l0.ts   — export const PERSONA_L0 = `...`;
 *   lib/bushy/persona/persona-l1.ts   — Record<PersonaTopic, string>
 *
 * DB:
 *   INSERT INTO persona_chunks (source_book, topic, chunk_text)
 *   with ON CONFLICT DO NOTHING semantics via a content hash
 *   (source_book + topic + md5(chunk_text) dedup in the script, since the
 *   table does not have a unique index yet — a future migration can tighten
 *   this).
 *
 * Usage:
 *   npx tsx scripts/distill-persona/06-emit.ts [--dry-run] [--help]
 */
import { createClient } from "@supabase/supabase-js";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..", "..");
const PROCESSED_DIR = resolve(
  REPO_ROOT,
  "data",
  "Knowledge",
  "processed",
  "Personality",
);
const TOPICS_DIR = resolve(PROCESSED_DIR, "topics");
const L0_DRAFT_PATH = resolve(PROCESSED_DIR, "persona-l0-draft.md");

const PERSONA_DIR = resolve(REPO_ROOT, "lib", "bushy", "persona");
const L0_TS_PATH = resolve(PERSONA_DIR, "persona-l0.ts");
const L1_TS_PATH = resolve(PERSONA_DIR, "persona-l1.ts");

const PERSONA_TOPICS = [
  "opening_a_conversation",
  "gathering_information",
  "building_rapport",
  "handling_disagreement",
  "delivering_hard_advice",
  "silence_and_pacing",
  "negotiating_data_share",
] as const;
type PersonaTopic = (typeof PERSONA_TOPICS)[number];

// Map each topic to its primary source book — used when inserting rows into
// persona_chunks so a future semantic retrieval pass can filter by author.
// Mirrors 03-topics.ts TOPIC_PRIMARY_SOURCES[0].
const TOPIC_PRIMARY_BOOK: Record<PersonaTopic, string> = {
  opening_a_conversation: "carnegie-how-to-win-friends",
  gathering_information: "voss-never-split-the-difference",
  building_rapport: "carnegie-how-to-win-friends",
  handling_disagreement: "patterson-crucial-conversations",
  delivering_hard_advice: "patterson-crucial-conversations",
  silence_and_pacing: "voss-never-split-the-difference",
  negotiating_data_share: "voss-never-split-the-difference",
};

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Phase 6 — TS + DB Emission

Usage:
  npx tsx scripts/distill-persona/06-emit.ts            Write TS + insert DB rows
  npx tsx scripts/distill-persona/06-emit.ts --dry-run  Preview without writing
  npx tsx scripts/distill-persona/06-emit.ts --help

Reads:
  data/Knowledge/processed/Personality/persona-l0-draft.md
  data/Knowledge/processed/Personality/topics/*.md

Writes:
  lib/bushy/persona/persona-l0.ts   (overwrites placeholder)
  lib/bushy/persona/persona-l1.ts   (overwrites placeholder)
  persona_chunks                    (Supabase INSERTs, paragraph-level)

Env vars (.env.local):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Content dedup: md5(source_book + topic + chunk_text) is compared against
existing rows before insert; rows matching are skipped. No unique index on
the table yet — a future migration can enforce this.
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");

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
// TS file emission
// ---------------------------------------------------------------------------

/**
 * Escape a string for embedding inside a TS template literal. We need to
 * escape backticks and ${...} interpolation sequences. Backslash handling
 * is intentional — Markdown frequently contains backslashes in regex-like
 * examples; we escape them too to be safe.
 */
function escapeForTemplateLiteral(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function renderL0Ts(markdown: string): string {
  const escaped = escapeForTemplateLiteral(markdown.trim());
  return `// WS5 Phase 6 — Bushy chat harness
// PERSONA_L0: the unified persona card generated by the distillation pipeline
// (scripts/distill-persona.ts). This file is OVERWRITTEN by Phase 6; edit the
// source topic chunks in data/Knowledge/processed/Personality/ and re-run the
// pipeline rather than hand-editing this file.
//
// Loaded in every Bushy system prompt. See lib/bushy/persona/system-prompt.ts.

export type PersonaTopic =
  | "opening_a_conversation"
  | "gathering_information"
  | "building_rapport"
  | "handling_disagreement"
  | "delivering_hard_advice"
  | "silence_and_pacing"
  | "negotiating_data_share";

export const PERSONA_L0 = \`${escaped}\`;

/**
 * Sentinel for the composer — true once the pipeline has filled the L0.
 * The harness tolerates an empty L0 (placeholder), so this flag lets the
 * composer log a warning if someone forgets to run the pipeline after a
 * knowledge refresh.
 */
export const PERSONA_L0_IS_PIPELINE_FILLED = PERSONA_L0.length > 0;
`;
}

function renderL1Ts(chunks: Record<PersonaTopic, string>): string {
  const entries = PERSONA_TOPICS.map((topic) => {
    const escaped = escapeForTemplateLiteral((chunks[topic] ?? "").trim());
    return `  ${topic}: \`${escaped}\`,`;
  }).join("\n");

  return `// WS5 Phase 6 — Bushy chat harness
// PERSONA_L1: per-topic ~800-token chunks generated by the distillation
// pipeline (scripts/distill-persona.ts). This file is OVERWRITTEN by Phase
// 6; edit the source topic chunks in data/Knowledge/processed/Personality/
// topics/ and re-run the pipeline rather than hand-editing this file.
//
// Loaded on-demand based on intent detection (see detect-intent.ts).

import type { PersonaTopic } from "./persona-l0";

export const PERSONA_L1: Record<PersonaTopic, string> = {
${entries}
};

export type { PersonaTopic };
`;
}

// ---------------------------------------------------------------------------
// Paragraph-level chunking (for persona_chunks table)
// ---------------------------------------------------------------------------

/**
 * Split a topic markdown chunk into paragraph-level fragments for L2
 * retrieval. Simple blank-line splitter; drops headings and ultra-short
 * fragments (<40 chars) that are not useful on their own.
 */
function splitIntoParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40 && !/^#{1,6}\s/.test(p));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ChunkRow {
  source_book: string;
  topic: PersonaTopic;
  chunk_text: string;
}

async function main(): Promise<void> {
  // ---- 1. Read L0 draft --------------------------------------------------
  if (!existsSync(L0_DRAFT_PATH)) {
    console.error(
      `ERROR: missing ${L0_DRAFT_PATH}. Run Phase 4 (04-l0.ts) first.`,
    );
    process.exit(1);
  }
  const l0Markdown = readFileSync(L0_DRAFT_PATH, "utf-8");

  // ---- 2. Read topic chunks ---------------------------------------------
  if (!existsSync(TOPICS_DIR)) {
    console.error(
      `ERROR: missing ${TOPICS_DIR}. Run Phase 3 (03-topics.ts) first.`,
    );
    process.exit(1);
  }

  const topicChunks: Record<PersonaTopic, string> = {
    opening_a_conversation: "",
    gathering_information: "",
    building_rapport: "",
    handling_disagreement: "",
    delivering_hard_advice: "",
    silence_and_pacing: "",
    negotiating_data_share: "",
  };
  const missingTopics: string[] = [];
  for (const topic of PERSONA_TOPICS) {
    const p = resolve(TOPICS_DIR, `${topic}.md`);
    if (!existsSync(p)) {
      missingTopics.push(topic);
      continue;
    }
    topicChunks[topic] = readFileSync(p, "utf-8");
  }
  if (missingTopics.length > 0) {
    console.error(
      `ERROR: missing topic chunks: ${missingTopics.join(", ")}. Run Phase 3.`,
    );
    process.exit(1);
  }

  // ---- 3. Render TS files (dry run skips writes) ------------------------
  const l0Ts = renderL0Ts(l0Markdown);
  const l1Ts = renderL1Ts(topicChunks);

  if (!DRY_RUN) {
    writeFileSync(L0_TS_PATH, l0Ts, "utf-8");
    writeFileSync(L1_TS_PATH, l1Ts, "utf-8");
    console.error(`Wrote ${L0_TS_PATH}`);
    console.error(`Wrote ${L1_TS_PATH}`);
  } else {
    console.error(`[dry-run] Would write ${L0_TS_PATH} (${l0Ts.length} chars)`);
    console.error(`[dry-run] Would write ${L1_TS_PATH} (${l1Ts.length} chars)`);
  }

  // ---- 4. Build paragraph-level rows ------------------------------------
  const rows: ChunkRow[] = [];
  for (const topic of PERSONA_TOPICS) {
    for (const paragraph of splitIntoParagraphs(topicChunks[topic])) {
      rows.push({
        source_book: TOPIC_PRIMARY_BOOK[topic],
        topic,
        chunk_text: paragraph,
      });
    }
  }

  // ---- 5. Supabase upsert (dedup by content hash) -----------------------
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (!DRY_RUN) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.error(
        "ERROR: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env.local.",
      );
      process.exit(1);
    }
    const supabase = createClient(url, serviceKey);

    // Fetch existing rows once and build a content-hash set for dedup.
    // The persona_chunks table has no unique index on (source_book, topic,
    // chunk_text) so we cannot rely on ON CONFLICT — hashing client-side
    // is the pragmatic equivalent.
    const { data: existing, error: fetchErr } = await supabase
      .from("persona_chunks")
      .select("source_book, topic, chunk_text");

    if (fetchErr) {
      console.error(`ERROR: fetch existing: ${fetchErr.message}`);
      process.exit(1);
    }

    const existingHashes = new Set<string>(
      (existing ?? []).map((r) =>
        hashRow(
          r.source_book as string,
          r.topic as string,
          r.chunk_text as string,
        ),
      ),
    );

    const toInsert: ChunkRow[] = [];
    for (const row of rows) {
      const h = hashRow(row.source_book, row.topic, row.chunk_text);
      if (existingHashes.has(h)) {
        skipped += 1;
        continue;
      }
      existingHashes.add(h);
      toInsert.push(row);
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("persona_chunks")
        .insert(toInsert);
      if (insertErr) {
        errors.push(insertErr.message);
        console.error(`INSERT error: ${insertErr.message}`);
      } else {
        inserted = toInsert.length;
      }
    }
  } else {
    console.error(
      `[dry-run] Would insert ${rows.length} paragraph-level rows into persona_chunks.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        phase: 6,
        dry_run: DRY_RUN,
        l0_bytes: l0Ts.length,
        l1_bytes: l1Ts.length,
        paragraph_rows_total: rows.length,
        paragraph_rows_inserted: inserted,
        paragraph_rows_skipped: skipped,
        errors,
      },
      null,
      2,
    ),
  );
}

function hashRow(book: string, topic: string, chunk: string): string {
  return createHash("md5")
    .update(`${book}\u0000${topic}\u0000${chunk}`)
    .digest("hex");
}

main().catch((err) => {
  console.error(`Fatal: ${String(err)}`);
  process.exit(1);
});
