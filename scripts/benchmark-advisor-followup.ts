#!/usr/bin/env npx tsx
/**
 * Benchmark advisor follow-up behavior for storage decisions.
 *
 * Usage:
 *   XAI_API_KEY=xai-... npx tsx scripts/benchmark-advisor-followup.ts
 *   XAI_API_KEY=xai-... npx tsx scripts/benchmark-advisor-followup.ts --model grok-4-1-fast-reasoning
 *   XAI_API_KEY=xai-... npx tsx scripts/benchmark-advisor-followup.ts --help
 *
 * Output:
 *   - JSON summary to stdout
 *   - Full responses and diagnostics to stderr
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { buildStorageDecisionSupport } from "../lib/advisor/context-builder";
import { retrieveAdvisorKnowledgeContext, type KnowledgeRetrievalMode } from "../lib/advisor/knowledge-retrieval";
import { buildAdvisorSystemPrompt } from "../lib/advisor/system-prompt";
import type { ChatContext } from "../lib/advisor/types";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Benchmark Advisor Follow-Up - Bushel Board Advisor

Usage:
  XAI_API_KEY=xai-... npx tsx scripts/benchmark-advisor-followup.ts
  XAI_API_KEY=xai-... npx tsx scripts/benchmark-advisor-followup.ts --model <grok-model-id>

Compares:
  1. baseline retrieval inside the production advisor prompt
  2. tiered retrieval inside the production advisor prompt

Measures:
  - whether the advisor asks one short follow-up when storage inputs are missing
  - whether it avoids asking for follow-up when the key inputs are already provided
  - whether the answer stays directional instead of refusing outright
`);
  process.exit(0);
}

function readFlagValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
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

const modelId = readFlagValue("--model") ?? "grok-4-1-fast-reasoning";

if (!process.env.XAI_API_KEY) {
  console.error("ERROR: XAI_API_KEY must be set in .env.local or the environment.");
  process.exit(1);
}

interface FollowupBenchmarkCase {
  id: string;
  grain: string;
  question: string;
  expectFollowUp: boolean;
  requiredFollowUpTerms: string[];
}

interface ModeCaseResult {
  mode: KnowledgeRetrievalMode;
  questionCount: number;
  asksFollowUp: boolean;
  followUpTermHits: string[];
  directionalHits: string[];
  mentionsInsufficientKnowledge: boolean;
  score: number;
  maxScore: number;
  retrievedHeadings: string[];
  response: string;
}

interface CaseResult {
  id: string;
  question: string;
  expect_follow_up: boolean;
  results: ModeCaseResult[];
}

const CASES: FollowupBenchmarkCase[] = [
  {
    id: "storage-missing-inputs",
    grain: "Canola",
    question: "Basis is starting to improve on canola I still have in bins. Should I store it or haul it now?",
    expectFollowUp: true,
    requiredFollowUpTerms: ["basis", "spread"],
  },
  {
    id: "storage-with-inputs",
    grain: "Canola",
    question:
      "Canola basis is -18 and the Jan-Apr spread is +9 cents. My storage cost is 2 cents a month. Should I store it or haul it now?",
    expectFollowUp: false,
    requiredFollowUpTerms: [],
  },
];

const DIRECTIONAL_PATTERNS = [/\bhold\b/i, /\bhaul\b/i, /\bstore\b/i, /\blean\b/i, /\bprice\b/i, /\bwatch\b/i];

function buildBenchmarkContext(grain: string, knowledgeText: string | null, decisionSupportText: string | null): ChatContext {
  return {
    farmer: {
      userId: "benchmark-user",
      cropYear: "2025-2026",
      grainWeek: 30,
      role: "farmer",
      grains: [
        {
          grain,
          acres: grain === "Canola" ? 500 : 800,
          starting_grain_kt: 1.5,
          remaining_kt: 1.0,
          delivered_kt: 0.5,
          contracted_kt: 0.2,
          uncontracted_kt: 0.8,
          percentile: 72,
          platform_holding_pct: 68,
          platform_hauling_pct: 20,
          platform_neutral_pct: 12,
          platform_vote_count: 15,
          intelligence_stance: "bullish",
          recommendation: "hold",
          thesis_title: "Coiled spring thesis",
          thesis_body: "Deliveries are slow, stocks drawing",
          bull_case: "China tariff relief + port congestion",
          bear_case: "Record production + South American exports",
        },
      ],
    },
    knowledgeText,
    decisionSupportText,
    logisticsSnapshot: { vessels_vancouver: 26, terminal_capacity_pct: 92 },
    cotSummary: "Managed Money: net short 52,858 contracts",
    priceContext: [
      {
        grain,
        latest_price: 672.5,
        price_change_pct: -1.2,
        contract: "Jul 2026",
        exchange: "ICE",
        currency: "CAD",
        price_date: "2026-03-14",
      },
    ],
    xSignals: [],
  };
}

async function askAdvisor(question: string, ctx: ChatContext): Promise<string> {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0,
      input: [
        { role: "system", content: buildAdvisorSystemPrompt(ctx) },
        { role: "user", content: question },
      ],
    }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`xAI ${response.status}: ${payload.slice(0, 300)}`);
  }

  const parsed = JSON.parse(payload) as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  return (parsed.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) =>
      (item.content ?? [])
        .filter((content) => content.type === "output_text")
        .map((content) => content.text ?? ""),
    )
    .join("")
    .trim();
}

function scoreCase(caseDef: FollowupBenchmarkCase, response: string, headings: string[]): Omit<ModeCaseResult, "mode" | "retrievedHeadings" | "response"> {
  const questionCount = (response.match(/\?/g) ?? []).length;
  const asksFollowUp = questionCount === 1;
  const followUpTermHits = caseDef.requiredFollowUpTerms.filter((term) =>
    response.toLowerCase().includes(term.toLowerCase()),
  );
  const directionalHits = DIRECTIONAL_PATTERNS.filter((pattern) => pattern.test(response)).map((pattern) => pattern.source);
  const mentionsInsufficientKnowledge = /\bINSUFFICIENT_KNOWLEDGE\b/i.test(response);

  let score = 0;
  let maxScore = 0;

  if (caseDef.expectFollowUp) {
    maxScore = 6;
    if (asksFollowUp) score += 2;
    score += followUpTermHits.length;
    if (directionalHits.length > 0) score += 1;
    if (!mentionsInsufficientKnowledge) score += 1;
  } else {
    maxScore = 4;
    if (!asksFollowUp) score += 2;
    if (directionalHits.length > 0) score += 1;
    if (!mentionsInsufficientKnowledge) score += 1;
  }

  return {
    questionCount,
    asksFollowUp,
    followUpTermHits,
    directionalHits,
    mentionsInsufficientKnowledge,
    score,
    maxScore,
  };
}

async function runMode(caseDef: FollowupBenchmarkCase, mode: KnowledgeRetrievalMode): Promise<ModeCaseResult> {
  const retrieval = await retrieveAdvisorKnowledgeContext({
    messageText: caseDef.question,
    grain: caseDef.grain,
    mode,
  });
  const decisionSupportText = buildStorageDecisionSupport(caseDef.question, retrieval);
  const ctx = buildBenchmarkContext(caseDef.grain, retrieval.contextText, decisionSupportText);
  const response = await askAdvisor(caseDef.question, ctx);
  const scored = scoreCase(caseDef, response, retrieval.chunks.map((chunk) => chunk.heading ?? ""));

  return {
    mode,
    questionCount: scored.questionCount,
    asksFollowUp: scored.asksFollowUp,
    followUpTermHits: scored.followUpTermHits,
    directionalHits: scored.directionalHits,
    mentionsInsufficientKnowledge: scored.mentionsInsufficientKnowledge,
    score: scored.score,
    maxScore: scored.maxScore,
    retrievedHeadings: retrieval.chunks.map((chunk) => chunk.heading ?? ""),
    response,
  };
}

async function main() {
  console.error("=== Bushel Board Advisor Follow-Up Benchmark ===\n");
  console.error(`Model: ${modelId}`);
  console.error("Comparing baseline vs tiered retrieval inside the production advisor prompt...\n");

  const caseResults: CaseResult[] = [];

  for (const benchmarkCase of CASES) {
    console.error(`CASE: ${benchmarkCase.id}`);
    console.error(`Question: ${benchmarkCase.question}\n`);

    const results = await Promise.all([
      runMode(benchmarkCase, "baseline"),
      runMode(benchmarkCase, "tiered"),
    ]);

    for (const result of results) {
      console.error(`[${result.mode}] score ${result.score}/${result.maxScore}`);
      console.error(`[${result.mode}] headings: ${result.retrievedHeadings.join(" | ") || "(none)"}`);
      console.error(`[${result.mode}] response:\n${result.response}\n`);
    }

    caseResults.push({
      id: benchmarkCase.id,
      question: benchmarkCase.question,
      expect_follow_up: benchmarkCase.expectFollowUp,
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
      follow_up_cases_passed: modeResults.filter((result) => result.asksFollowUp).length,
      average_questions_per_reply: Number(
        (
          modeResults.reduce((sum, result) => sum + result.questionCount, 0) /
          Math.max(modeResults.length, 1)
        ).toFixed(2),
      ),
    };
  });

  console.error("Summary:");
  for (const item of summary) {
    console.error(
      `  ${item.mode}: ${item.total_score}/${item.max_score} (${item.pct}%), avg questions ${item.average_questions_per_reply}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        benchmark: "advisor-followup",
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
