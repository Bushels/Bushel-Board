#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.6 — Persona distillation Phase 5: Opus verification
 *
 * Runs Opus 4.7 against each generated chunk (L0 draft + 7 L1 topic
 * chunks) with three checks:
 *
 *   1. Attribution accuracy — every named principle can be traced back to
 *      a real chapter in the provided {book}-chapters.json files.
 *   2. Voice preservation — Voss's verbatim scripts survive; Carnegie's
 *      named anecdotes are recognizable; Patterson's contrast-statement
 *      patterns are intact.
 *   3. No corporate drift — forbidden tokens ("leverage", "stakeholder",
 *      "engagement", "circle back") are absent.
 *
 * Emits data/Knowledge/processed/Personality/verification-report.json:
 *   { chunks: [{ file, status: "PASS" | "REVISE", issues: [...] }], ... }
 *
 * Does NOT auto-revise. The orchestrator prints REVISE files and exits;
 * the operator re-runs Phase 3 with --revise after reviewing them.
 *
 * Usage:
 *   npx tsx scripts/distill-persona/05-verify.ts [--help]
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { resolve } from "path";

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
const REPORT_PATH = resolve(PROCESSED_DIR, "verification-report.json");

const MODEL_ID = "claude-opus-4.7";
const MAX_OUTPUT_TOKENS = 3000;

const BOOK_SLUGS = [
  "carnegie-how-to-win-friends",
  "voss-never-split-the-difference",
  "patterson-crucial-conversations",
  "cabane-charisma-myth",
] as const;

// Forbidden tokens — regex with word boundaries so "leveraged" in an
// unrelated context doesn't trigger. Matches design doc §5.
const FORBIDDEN_WORDS = [
  "leverage",
  "stakeholder",
  "engagement",
  "circle back",
];

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Phase 5 — Opus Verification

Usage:
  npx tsx scripts/distill-persona/05-verify.ts [--help]

Reads:
  data/Knowledge/processed/Personality/persona-l0-draft.md
  data/Knowledge/processed/Personality/topics/*.md
  data/Knowledge/processed/Personality/*-chapters.json  (ground truth for attribution)

Writes:
  data/Knowledge/processed/Personality/verification-report.json

Checks per chunk:
  1. Attribution — named principles trace to real chapters
  2. Voice     — Voss verbatim scripts + Carnegie examples present
  3. No drift  — no "leverage", "stakeholder", "engagement", "circle back"

Env vars (.env.local):
  ANTHROPIC_API_KEY

Model: ${MODEL_ID}
No auto-revise — emits PASS/REVISE per chunk. Run 03-topics.ts --revise on
REVISE chunks after reviewing the report.
`);
  process.exit(0);
}

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
// Local deterministic checks (pre-filter before spending Opus tokens)
// ---------------------------------------------------------------------------

interface LocalCheck {
  forbiddenWordsFound: string[];
}

function localPreCheck(chunkText: string): LocalCheck {
  const lower = chunkText.toLowerCase();
  const found: string[] = [];
  for (const word of FORBIDDEN_WORDS) {
    // Word-boundary match so "leveraged" inside a legitimate quote still
    // triggers — the ban is on corporate phrasing, not the letter sequence
    // in unrelated contexts. Opus will judge borderline cases.
    const pattern = new RegExp(
      `\\b${word.replace(/\s+/g, "\\s+")}\\b`,
      "i",
    );
    if (pattern.test(lower)) found.push(word);
  }
  return { forbiddenWordsFound: found };
}

// ---------------------------------------------------------------------------
// Opus prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a strict verifier for AI persona content. For each chunk you are given, apply three checks:

  1. Attribution accuracy — every named principle, script, or anecdote in the chunk should trace to a real chapter in the provided chapter-summary JSONs. Flag anything that looks invented, misattributed, or paraphrased beyond recognition.
  2. Voice preservation — look for these canonical scripts/examples. The chunk does not have to include all of them, but if it claims to teach the topic it should include at least one verbatim script where that author's voice is core:
       * Voss: calibrated questions like "How am I supposed to do that?", mirroring the last 1-3 words, labeling ("It sounds like...")
       * Carnegie: name-use ("a person's name is ... the sweetest and most important sound"), genuine interest, six ways to make people like you
       * Patterson: contrast statements ("I don't want to say X. What I do want is Y."), safety + mutual purpose
       * Cabane: presence, pause, warmth/power demeanor
  3. No corporate drift — forbidden tokens anywhere in the chunk (even inside quotes): "leverage", "stakeholder", "engagement", "circle back". These are your hard-fail triggers.

Output JSON only, no markdown fences. Exact shape:
{
  "status": "PASS" | "REVISE",
  "issues": [ "string — one issue per line, specific and actionable" ],
  "strengths": [ "string — what the chunk got right, for the operator to preserve" ]
}

Status rules:
- Any forbidden-token match → REVISE.
- Any unattributable claim → REVISE.
- A chunk missing all verbatim scripts from its primary author → REVISE.
- Otherwise PASS (even if there are minor nits — put nits in issues but keep PASS).`;

function buildUserPrompt(
  chunkFile: string,
  chunkText: string,
  chapterJsons: Record<string, string>,
): string {
  return `Chunk filename: ${chunkFile}

Ground truth — chapter summaries for all four source books:

### Carnegie — How to Win Friends and Influence People
${chapterJsons["carnegie-how-to-win-friends"] ?? "(missing)"}

### Voss + Raz — Never Split the Difference
${chapterJsons["voss-never-split-the-difference"] ?? "(missing)"}

### Patterson et al — Crucial Conversations
${chapterJsons["patterson-crucial-conversations"] ?? "(missing)"}

### Cabane — The Charisma Myth
${chapterJsons["cabane-charisma-myth"] ?? "(missing)"}

---

Chunk under review:

${chunkText}

---

Apply the three checks. Output JSON only.`;
}

// ---------------------------------------------------------------------------
// Opus call
// ---------------------------------------------------------------------------

interface OpusVerdict {
  status: "PASS" | "REVISE";
  issues: string[];
  strengths: string[];
}

async function verifyChunk(
  client: Anthropic,
  chunkFile: string,
  chunkText: string,
  chapterJsons: Record<string, string>,
): Promise<OpusVerdict> {
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(chunkFile, chunkText, chapterJsons),
      },
    ],
  });

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return parseVerdict(text);
}

function parseVerdict(raw: string): OpusVerdict {
  const trimmed = raw.trim();
  let jsonStr = trimmed;
  if (!jsonStr.startsWith("{")) {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new Error(`Opus did not return JSON: ${trimmed.slice(0, 200)}`);
    }
    jsonStr = trimmed.slice(first, last + 1);
  }
  const parsed = JSON.parse(jsonStr) as {
    status?: string;
    issues?: string[];
    strengths?: string[];
  };

  const status: "PASS" | "REVISE" =
    parsed.status === "PASS" ? "PASS" : "REVISE";
  return {
    status,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ChunkVerdict {
  file: string;
  status: "PASS" | "REVISE";
  issues: string[];
  strengths: string[];
  /** Deterministic check — even if Opus says PASS, forbidden words force REVISE. */
  forbidden_words_found: string[];
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set in .env.local.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  // Load ground-truth chapter JSONs.
  const chapterJsons: Record<string, string> = {};
  for (const slug of BOOK_SLUGS) {
    const p = resolve(PROCESSED_DIR, `${slug}-chapters.json`);
    if (!existsSync(p)) {
      console.error(
        `ERROR: missing ${p}. Run Phase 2 (02-chapters.ts) first.`,
      );
      process.exit(1);
    }
    chapterJsons[slug] = readFileSync(p, "utf-8");
  }

  // Collect all chunks under review: L0 draft + every topic .md.
  const chunks: Array<{ file: string; path: string }> = [];
  if (existsSync(L0_DRAFT_PATH)) {
    chunks.push({ file: "persona-l0-draft.md", path: L0_DRAFT_PATH });
  } else {
    console.error(
      `Warning: ${L0_DRAFT_PATH} missing. Skipping L0 verification.`,
    );
  }
  if (existsSync(TOPICS_DIR)) {
    for (const entry of readdirSync(TOPICS_DIR).sort()) {
      if (entry.endsWith(".md")) {
        chunks.push({
          file: `topics/${entry}`,
          path: resolve(TOPICS_DIR, entry),
        });
      }
    }
  }

  if (chunks.length === 0) {
    console.error(
      "ERROR: no chunks to verify. Run Phases 3 and 4 first.",
    );
    process.exit(1);
  }

  const verdicts: ChunkVerdict[] = [];

  for (const { file, path } of chunks) {
    const text = readFileSync(path, "utf-8");
    const local = localPreCheck(text);

    console.error(`[${file}] verifying...`);
    let verdict: OpusVerdict;
    try {
      verdict = await verifyChunk(client, file, text, chapterJsons);
    } catch (err) {
      console.error(`  Opus call failed: ${String(err)}`);
      process.exit(1);
    }

    // Deterministic override: forbidden words force REVISE even if Opus
    // missed them.
    const finalStatus: "PASS" | "REVISE" =
      local.forbiddenWordsFound.length > 0 ? "REVISE" : verdict.status;
    const mergedIssues = [...verdict.issues];
    if (local.forbiddenWordsFound.length > 0) {
      mergedIssues.unshift(
        `Forbidden corporate terms present: ${local.forbiddenWordsFound.join(", ")}`,
      );
    }

    const cv: ChunkVerdict = {
      file,
      status: finalStatus,
      issues: mergedIssues,
      strengths: verdict.strengths,
      forbidden_words_found: local.forbiddenWordsFound,
    };
    verdicts.push(cv);
    console.error(
      `  ${finalStatus}${cv.issues.length > 0 ? ` (${cv.issues.length} issues)` : ""}`,
    );
  }

  const report = {
    phase: 5,
    model: MODEL_ID,
    generated_at: new Date().toISOString(),
    pass_count: verdicts.filter((v) => v.status === "PASS").length,
    revise_count: verdicts.filter((v) => v.status === "REVISE").length,
    chunks: verdicts,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.error(`Wrote report to ${REPORT_PATH}`);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(`Fatal: ${String(err)}`);
  process.exit(1);
});
