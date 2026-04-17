#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.4 — Persona distillation Phase 3: topic synthesis (Sonnet)
 *
 * Reads the four {book}-chapters.json files produced by Phase 2 and, for
 * each of the seven persona L1 topics, calls Sonnet 4.6 with all four
 * chapter summaries as context. The model pulls the relevant material per
 * the design doc §5 table and emits a single markdown chunk (~800 tokens)
 * for that topic.
 *
 * Primary-source matrix (design doc §5):
 *   opening_a_conversation    Carnegie + Cabane
 *   gathering_information     Voss + Carnegie
 *   building_rapport          Carnegie + Cabane
 *   handling_disagreement     Patterson + Voss
 *   delivering_hard_advice    Patterson + Cabane
 *   silence_and_pacing        Voss + Cabane
 *   negotiating_data_share    Voss + Carnegie
 *
 * Usage:
 *   npx tsx scripts/distill-persona/03-topics.ts [--topic <name>] [--revise]
 *
 * Reads:  data/Knowledge/processed/Personality/*-chapters.json
 * Writes: data/Knowledge/processed/Personality/topics/{topic}.md
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

const MODEL_ID = "claude-sonnet-4.6";
const MAX_OUTPUT_TOKENS = 2500;

const BOOK_SLUGS = [
  "carnegie-how-to-win-friends",
  "voss-never-split-the-difference",
  "patterson-crucial-conversations",
  "cabane-charisma-myth",
] as const;
type BookSlug = (typeof BOOK_SLUGS)[number];

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

// Design-doc primary sources per topic. Sonnet is told which books to lean
// on most — not which to exclude — so it can pull a killer anecdote from a
// non-primary source if one surfaces.
const TOPIC_PRIMARY_SOURCES: Record<PersonaTopic, BookSlug[]> = {
  opening_a_conversation: [
    "carnegie-how-to-win-friends",
    "cabane-charisma-myth",
  ],
  gathering_information: [
    "voss-never-split-the-difference",
    "carnegie-how-to-win-friends",
  ],
  building_rapport: [
    "carnegie-how-to-win-friends",
    "cabane-charisma-myth",
  ],
  handling_disagreement: [
    "patterson-crucial-conversations",
    "voss-never-split-the-difference",
  ],
  delivering_hard_advice: [
    "patterson-crucial-conversations",
    "cabane-charisma-myth",
  ],
  silence_and_pacing: [
    "voss-never-split-the-difference",
    "cabane-charisma-myth",
  ],
  negotiating_data_share: [
    "voss-never-split-the-difference",
    "carnegie-how-to-win-friends",
  ],
};

const TOPIC_TEACHING_GOAL: Record<PersonaTopic, string> = {
  opening_a_conversation: "Warm greetings, presence, how to start without feeling scripted",
  gathering_information: "Calibrated questions, mirroring, labeling — get them talking without interrogation",
  building_rapport: "Genuine interest, common ground, remembering what they told you",
  handling_disagreement: "Create safety, use contrast statements, treat 'no' as the start not the end",
  delivering_hard_advice: "Recommend without preaching, give the bad news without losing the relationship",
  silence_and_pacing: "When NOT to talk, the power of pause, reading the room",
  negotiating_data_share: "Gamified data exchange — ask for price/cost info in a way they want to give it",
};

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Phase 3 — Topic Synthesis (Sonnet)

Usage:
  npx tsx scripts/distill-persona/03-topics.ts                Synthesize all 7 topics
  npx tsx scripts/distill-persona/03-topics.ts --topic <name> Single topic
  npx tsx scripts/distill-persona/03-topics.ts --revise       Only regenerate topics whose .md already exists (pipelined revision pass)

Topic names:
  ${PERSONA_TOPICS.join("\n  ")}

Reads:  data/Knowledge/processed/Personality/*-chapters.json
Writes: data/Knowledge/processed/Personality/topics/{topic}.md

Env vars (.env.local):
  ANTHROPIC_API_KEY

Model: ${MODEL_ID}
Target: ~800 tokens per topic chunk
`);
  process.exit(0);
}

const topicArgIndex = args.indexOf("--topic");
const topicFilter = topicArgIndex !== -1 ? args[topicArgIndex + 1] : null;
const REVISE_MODE = args.includes("--revise");

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

const SYSTEM_PROMPT = `You synthesize chapter-level summaries of four personality/communication books into focused topic chunks for an AI assistant ("Bushy") who talks to Canadian prairie grain farmers.

Each topic chunk must:
- Be ~800 tokens of markdown (roughly 1200-1400 words is too long; aim for 500-700 words). Tighter is better.
- Use headings, bullets, and short quotes. No filler prose.
- Preserve verbatim phrasing where the author provides a script the reader is supposed to say. Quote it in backticks or as a blockquote. Examples:
    * Chris Voss: "How am I supposed to do that?"
    * Dale Carnegie: "Remember that a person's name is, to that person, the sweetest and most important sound in any language."
    * Patterson: "I know you might think X. Nothing could be further from the truth — what I actually think is Y."
- Attribute named principles to their source author+book so downstream verification can trace them.
- Never use: "leverage", "stakeholder", "engagement", "circle back". These are corporate-speak; Bushy is a farming buddy.
- No meta-commentary about the synthesis process. Just the finished chunk.`;

function buildUserPrompt(topic: PersonaTopic, chapterJsons: Record<BookSlug, string>): string {
  const primarySources = TOPIC_PRIMARY_SOURCES[topic]
    .map((s) => BOOK_TITLES[s])
    .join(" + ");

  return `Topic: **${topic}**
Teaching goal: ${TOPIC_TEACHING_GOAL[topic]}
Primary sources: ${primarySources}
(You may still use material from the other two books if it's particularly strong.)

Here are the chapter-level summaries for all four books. Pull the material relevant to this topic and synthesize a single markdown chunk.

### Carnegie — How to Win Friends and Influence People
${chapterJsons["carnegie-how-to-win-friends"]}

### Voss + Raz — Never Split the Difference
${chapterJsons["voss-never-split-the-difference"]}

### Patterson et al — Crucial Conversations
${chapterJsons["patterson-crucial-conversations"]}

### Cabane — The Charisma Myth
${chapterJsons["cabane-charisma-myth"]}

Output requirements:
- Markdown only. No JSON, no YAML frontmatter.
- Target 500-700 words.
- Start with a single-sentence "When Bushy uses this" line.
- Use section headings for different tactics within the topic.
- Quote author phrasing verbatim (in backticks or blockquotes) when the author provides a specific script.
- Attribute: after each named principle, note which book+author it's from in parens.
- Close with a short "Don't do this" mini-section listing 2-3 anti-patterns.

Write the chunk now.`;
}

const BOOK_TITLES: Record<BookSlug, string> = {
  "carnegie-how-to-win-friends":
    "Carnegie, How to Win Friends and Influence People",
  "voss-never-split-the-difference":
    "Voss with Raz, Never Split the Difference",
  "patterson-crucial-conversations":
    "Patterson et al, Crucial Conversations",
  "cabane-charisma-myth": "Cabane, The Charisma Myth",
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function synthesizeTopic(
  client: Anthropic,
  topic: PersonaTopic,
  chapterJsons: Record<BookSlug, string>,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildUserPrompt(topic, chapterJsons) },
    ],
  });

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error(`Sonnet returned empty response for topic ${topic}`);
  }
  return text;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set in .env.local.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  // Load all four chapter files — the synthesis prompt needs cross-book
  // context regardless of which topic is being generated.
  const chapterJsons: Record<BookSlug, string> = {
    "carnegie-how-to-win-friends": "",
    "voss-never-split-the-difference": "",
    "patterson-crucial-conversations": "",
    "cabane-charisma-myth": "",
  };
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

  mkdirSync(TOPICS_DIR, { recursive: true });

  const topics: PersonaTopic[] = topicFilter
    ? PERSONA_TOPICS.filter((t) => t === topicFilter)
    : [...PERSONA_TOPICS];

  if (topics.length === 0) {
    console.error(
      `ERROR: --topic ${topicFilter} not recognized. Valid: ${PERSONA_TOPICS.join(", ")}`,
    );
    process.exit(1);
  }

  const results: Array<{ topic: PersonaTopic; output: string; words: number }> = [];

  for (const topic of topics) {
    const outPath = resolve(TOPICS_DIR, `${topic}.md`);
    if (REVISE_MODE && !existsSync(outPath)) {
      console.error(`[${topic}] SKIP — --revise set but no existing file`);
      continue;
    }

    console.error(`[${topic}] synthesizing...`);
    let markdown: string;
    try {
      markdown = await synthesizeTopic(client, topic, chapterJsons);
    } catch (err) {
      console.error(`  Sonnet call failed: ${String(err)}`);
      process.exit(1);
    }

    writeFileSync(outPath, markdown, "utf-8");
    const words = markdown.split(/\s+/).filter(Boolean).length;
    console.error(`  wrote ${words} words to ${outPath}`);
    results.push({ topic, output: outPath.replaceAll("\\", "/"), words });
  }

  console.log(
    JSON.stringify(
      {
        phase: 3,
        model: MODEL_ID,
        revise_mode: REVISE_MODE,
        synthesized: results,
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
