#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.5 — Persona distillation Phase 4: L0 unification (Sonnet)
 *
 * Reads the seven topic markdown chunks produced by Phase 3 and calls
 * Sonnet 4.6 to synthesize a single ~500-token L0 card that captures
 * Bushy's unified persona across all four books. The output format
 * mirrors lib/knowledge/viking-l0.ts exactly: 8 numbered principles +
 * a topic index.
 *
 * The L0 is loaded in every system prompt, so tokens are precious —
 * compression matters more than coverage.
 *
 * Usage:
 *   npx tsx scripts/distill-persona/04-l0.ts [--help]
 *
 * Reads:  data/Knowledge/processed/Personality/topics/*.md
 * Writes: data/Knowledge/processed/Personality/persona-l0-draft.md
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  existsSync,
  readFileSync,
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
const OUT_PATH = resolve(PROCESSED_DIR, "persona-l0-draft.md");

const MODEL_ID = "claude-sonnet-4.6";
const MAX_OUTPUT_TOKENS = 1500;

const PERSONA_TOPICS = [
  "opening_a_conversation",
  "gathering_information",
  "building_rapport",
  "handling_disagreement",
  "delivering_hard_advice",
  "silence_and_pacing",
  "negotiating_data_share",
] as const;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Phase 4 — L0 Unification (Sonnet)

Usage:
  npx tsx scripts/distill-persona/04-l0.ts [--help]

Reads:  data/Knowledge/processed/Personality/topics/*.md
Writes: data/Knowledge/processed/Personality/persona-l0-draft.md

Env vars (.env.local):
  ANTHROPIC_API_KEY

Model: ${MODEL_ID}
Target: ~500 tokens (8 numbered principles + topic index)
Mirrors format: lib/knowledge/viking-l0.ts
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
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You compress seven topic-specific persona chunks into a single ~500 token L0 card for an AI assistant ("Bushy") that talks to Canadian prairie grain farmers.

The L0 is loaded in every system prompt — compression is more important than coverage. Prioritize the principles that change Bushy's behavior most across a wide range of conversations.

Format requirement (mirror this exactly, it matches the existing VIKING_L0):

## Communication & Persona Card

<One-sentence framing of what distilled expertise Bushy draws on.>

### Core Principles
1. **Name of principle.** One-two sentence statement in the author's voice. Prefer verbatim phrasing where strong.
2. **...**
3. **...**
4. **...**
5. **...**
6. **...**
7. **...**
8. **...**

### Topic Index (for deeper retrieval)
When the conversation touches these topics, deeper knowledge is available:
- **Topic name** — short phrase describing when this topic fires

Rules:
- Exactly 8 numbered principles.
- Each principle should synthesize across books, not just quote one. Name the book only when citing a specific script verbatim.
- Total budget: ~500 tokens. Tighter is better.
- Topic index must reference the seven persona topics by their slug-friendly name.
- Never use: "leverage", "stakeholder", "engagement", "circle back".
- Output markdown only — no JSON, no YAML frontmatter, no meta commentary.`;

function buildUserPrompt(topicChunks: Record<string, string>): string {
  const sections = PERSONA_TOPICS.map(
    (t) => `### ${t}\n\n${topicChunks[t] ?? "(missing)"}`,
  ).join("\n\n---\n\n");

  return `Here are the seven Phase-3 topic chunks. Synthesize a unified L0 card following the format in the system prompt.

${sections}

Write the L0 card now.`;
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

  const topicChunks: Record<string, string> = {};
  for (const topic of PERSONA_TOPICS) {
    const p = resolve(TOPICS_DIR, `${topic}.md`);
    if (!existsSync(p)) {
      console.error(
        `ERROR: missing ${p}. Run Phase 3 (03-topics.ts) first.`,
      );
      process.exit(1);
    }
    topicChunks[topic] = readFileSync(p, "utf-8");
  }

  console.error(`Unifying ${PERSONA_TOPICS.length} topic chunks into L0...`);

  let response;
  try {
    response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserPrompt(topicChunks) },
      ],
    });
  } catch (err) {
    console.error(`Sonnet call failed: ${String(err)}`);
    process.exit(1);
  }

  const markdown = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  if (!markdown) {
    console.error("ERROR: Sonnet returned empty L0.");
    process.exit(1);
  }

  writeFileSync(OUT_PATH, markdown, "utf-8");
  const words = markdown.split(/\s+/).filter(Boolean).length;
  console.error(`Wrote ${words} words to ${OUT_PATH}`);

  console.log(
    JSON.stringify(
      {
        phase: 4,
        model: MODEL_ID,
        output: OUT_PATH.replaceAll("\\", "/"),
        word_count: words,
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
