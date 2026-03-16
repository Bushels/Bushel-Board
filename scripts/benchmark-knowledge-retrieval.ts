#!/usr/bin/env npx tsx
/**
 * Benchmark advisor knowledge retrieval before vs. after the tiered upgrade.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-knowledge-retrieval.ts
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-knowledge-retrieval.ts --model stepfun/step-3.5-flash:free
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-knowledge-retrieval.ts --help
 *
 * Output:
 *   - JSON summary to stdout
 *   - Retrieval traces and full model responses to stderr
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { CHAT_MODELS, OPENROUTER_BASE_URL } from "../lib/advisor/openrouter-client";
import {
  retrieveAdvisorKnowledgeContext,
  type KnowledgeRetrievalMode,
  type RetrievedKnowledgeChunk,
} from "../lib/advisor/knowledge-retrieval";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Benchmark Knowledge Retrieval - Bushel Board Advisor

Usage:
  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-knowledge-retrieval.ts
  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-knowledge-retrieval.ts --model <openrouter-model-id>

Compares:
  1. baseline retrieval (current raw-message RPC usage)
  2. tiered retrieval (query expansion + document diversity)

Measures:
  - retrieved heading coverage
  - source diversity
  - whether the same model uses the expected Bushel frameworks
  - negative-control resistance to guessing
`);
  process.exit(0);
}

function loadEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) return;

  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const modelArgIndex = args.indexOf("--model");
const modelId = modelArgIndex !== -1 ? args[modelArgIndex + 1] : CHAT_MODELS.primary;

if (!process.env.OPENROUTER_API_KEY) {
  console.error("ERROR: OPENROUTER_API_KEY must be set in .env.local or the environment.");
  process.exit(1);
}

interface BenchmarkCase {
  id: string;
  grain: string;
  question: string;
  expectedHeadings: string[];
  expectedPatterns: RegExp[];
  expectInsufficientKnowledge?: boolean;
}

interface ModeCaseResult {
  mode: KnowledgeRetrievalMode;
  retrievedHeadings: string[];
  sourcePaths: string[];
  topicTags: string[];
  queryPlan: string[];
  retrievalHeadingHits: string[];
  answerPatternHits: string[];
  citedHeadingHits: string[];
  insufficientKnowledge: boolean;
  score: number;
  maxScore: number;
  response: string;
}

interface CaseResult {
  id: string;
  grain: string;
  question: string;
  results: ModeCaseResult[];
}

const CASES: BenchmarkCase[] = [
  {
    id: "canola-storage",
    grain: "Canola",
    question: "Basis is starting to improve on canola I still have in bins. Should I store it or haul it now?",
    expectedHeadings: ["Basis Signal Matrix", "Storage Decision Algorithm"],
    expectedPatterns: [/\bbasis\b/i, /\bstore|storage\b/i, /\bcarry\b/i],
  },
  {
    id: "contract-selection",
    grain: "Canola",
    question: "If I think canola futures can still rally, should I use a basis contract, deferred delivery, or options?",
    expectedHeadings: ["Contract Type Selection by Market Outlook", "Option Strategies for Sellers (Farmers)"],
    expectedPatterns: [/\bbasis contract\b/i, /\bdeferred delivery\b/i, /\boption/i],
  },
  {
    id: "cot-timing",
    grain: "Canola",
    question: "Managed money is very short. Do I use COT for direction or just timing?",
    expectedHeadings: ["COT Integration Rule", "CFTC COT Positioning Analysis"],
    expectedPatterns: [/\btiming\b/i, /\bdirection\b/i, /\bmanaged money\b/i],
  },
  {
    id: "logistics-basis",
    grain: "Wheat",
    question: "If port congestion builds, what usually happens to basis and transport risk?",
    expectedHeadings: ["Logistics & Transport Awareness", "Regional Transport Cost Context"],
    expectedPatterns: [/\bbasis\b/i, /\btransport\b/i, /\bcongestion|backlog\b/i],
  },
  {
    id: "negative-control",
    grain: "Wheat",
    question: "What exact protein spec defines No. 1 CWRS wheat?",
    expectedHeadings: [],
    expectedPatterns: [],
    expectInsufficientKnowledge: true,
  },
];

function scoreCase(caseDef: BenchmarkCase, chunks: RetrievedKnowledgeChunk[], response: string): Omit<ModeCaseResult, "mode" | "sourcePaths" | "topicTags" | "queryPlan" | "response"> {
  const retrievedHeadings = chunks.map((chunk) => chunk.heading ?? "");
  const retrievalHeadingHits = caseDef.expectedHeadings.filter((heading) =>
    retrievedHeadings.some((retrieved) => retrieved.toLowerCase() === heading.toLowerCase()),
  );
  const answerPatternHits = caseDef.expectedPatterns
    .filter((pattern) => pattern.test(response))
    .map((pattern) => pattern.source);
  const citedHeadingHits = caseDef.expectedHeadings.filter((heading) =>
    response.toLowerCase().includes(heading.toLowerCase()),
  );
  const insufficientKnowledge = /\bINSUFFICIENT_KNOWLEDGE\b/i.test(response);

  let score = 0;
  let maxScore = 0;

  if (caseDef.expectInsufficientKnowledge) {
    maxScore = 3;
    if (insufficientKnowledge) score += 3;
  } else {
    maxScore = caseDef.expectedHeadings.length + caseDef.expectedPatterns.length + caseDef.expectedHeadings.length + 1;
    score += retrievalHeadingHits.length;
    score += answerPatternHits.length;
    score += citedHeadingHits.length;
    if (!insufficientKnowledge) score += 1;
  }

  return {
    retrievedHeadings,
    retrievalHeadingHits,
    answerPatternHits,
    citedHeadingHits,
    insufficientKnowledge,
    score,
    maxScore,
  };
}

async function askModel(question: string, contextText: string | null): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://bushelboard.com",
      "X-Title": "Bushel Board Knowledge Benchmark",
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0,
      max_tokens: 450,
      messages: [
        {
          role: "system",
          content:
            "Answer only from the Retrieved Knowledge. Do not use outside knowledge. " +
            'If the answer is not contained in the Retrieved Knowledge, reply exactly "INSUFFICIENT_KNOWLEDGE". ' +
            "If you do answer, end with a single line formatted exactly as: Sources: heading one; heading two",
        },
        {
          role: "user",
          content: `Question:\n${question}\n\nRetrieved Knowledge:\n${contextText ?? "(none)"}`,
        },
      ],
    }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${payload.slice(0, 300)}`);
  }

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parsed.choices?.[0]?.message?.content?.trim() ?? "";
}

async function runMode(caseDef: BenchmarkCase, mode: KnowledgeRetrievalMode): Promise<ModeCaseResult> {
  const retrieval = await retrieveAdvisorKnowledgeContext({
    messageText: caseDef.question,
    grain: caseDef.grain,
    mode,
  });
  const response = await askModel(caseDef.question, retrieval.contextText);
  const scored = scoreCase(caseDef, retrieval.chunks, response);

  return {
    mode,
    retrievedHeadings: scored.retrievedHeadings,
    sourcePaths: retrieval.sourcePaths,
    topicTags: retrieval.topicTags,
    queryPlan: retrieval.queryPlan.map((entry) => `${entry.id}: ${entry.query}`),
    retrievalHeadingHits: scored.retrievalHeadingHits,
    answerPatternHits: scored.answerPatternHits,
    citedHeadingHits: scored.citedHeadingHits,
    insufficientKnowledge: scored.insufficientKnowledge,
    score: scored.score,
    maxScore: scored.maxScore,
    response,
  };
}

async function main() {
  console.error("=== Bushel Board Knowledge Retrieval Benchmark ===\n");
  console.error(`Model: ${modelId}`);
  console.error("Comparing baseline vs tiered retrieval on fixed advisor knowledge cases...\n");

  const caseResults: CaseResult[] = [];

  for (const benchmarkCase of CASES) {
    console.error(`CASE: ${benchmarkCase.id} (${benchmarkCase.grain})`);
    console.error(`Question: ${benchmarkCase.question}\n`);

    const results = await Promise.all([
      runMode(benchmarkCase, "baseline"),
      runMode(benchmarkCase, "tiered"),
    ]);

    for (const result of results) {
      console.error(`[${result.mode}] score ${result.score}/${result.maxScore}`);
      console.error(`[${result.mode}] headings: ${result.retrievedHeadings.join(" | ") || "(none)"}`);
      console.error(`[${result.mode}] sources: ${result.sourcePaths.join(" | ") || "(none)"}`);
      console.error(`[${result.mode}] query plan:`);
      for (const query of result.queryPlan) {
        console.error(`  - ${query}`);
      }
      console.error(`[${result.mode}] response:\n${result.response}\n`);
    }

    caseResults.push({
      id: benchmarkCase.id,
      grain: benchmarkCase.grain,
      question: benchmarkCase.question,
      results,
    });
  }

  const summary = (["baseline", "tiered"] as const).map((mode) => {
    const modeResults = caseResults.map((caseResult) => caseResult.results.find((result) => result.mode === mode)!);
    const totalScore = modeResults.reduce((sum, result) => sum + result.score, 0);
    const maxScore = modeResults.reduce((sum, result) => sum + result.maxScore, 0);

    return {
      mode,
      total_score: totalScore,
      max_score: maxScore,
      pct: maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(1)) : 0,
      avg_unique_sources: Number(
        (
          modeResults.reduce((sum, result) => sum + new Set(result.sourcePaths).size, 0) /
          Math.max(modeResults.length, 1)
        ).toFixed(2),
      ),
      insufficient_knowledge_cases_passed: modeResults.filter((result) => result.insufficientKnowledge).length,
    };
  });

  console.error("Summary:");
  for (const item of summary) {
    console.error(
      `  ${item.mode}: ${item.total_score}/${item.max_score} (${item.pct}%), avg unique sources ${item.avg_unique_sources}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        benchmark: "advisor-knowledge-retrieval",
        timestamp: new Date().toISOString(),
        model: modelId,
        summary,
        cases: caseResults,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`Fatal error: ${String(error)}`);
  process.exit(1);
});
