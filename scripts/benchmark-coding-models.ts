#!/usr/bin/env npx tsx
/**
 * Benchmark three OpenRouter models on Bushel Board coding tasks.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-coding-models.ts
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-coding-models.ts --help
 *
 * Output:
 *   - JSON summary to stdout
 *   - Per-case diagnostics and full responses to stderr
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Benchmark Coding Models - Bushel Board

Usage:
  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-coding-models.ts

Tests three OpenRouter models on Bushel-specific engineering tasks:
  1. Step 3.5 Flash
  2. Arcee Trinity Large
  3. Nvidia Nemotron Super

Measures:
  - correctness against Bushel architecture rules
  - code review usefulness
  - SQL/data pipeline reasoning
  - latency
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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("ERROR: Set OPENROUTER_API_KEY in .env.local or environment.");
  process.exit(1);
}

const MODELS = [
  {
    id: "stepfun/step-3.5-flash:free",
    name: "Step 3.5 Flash",
    params: "reasoning-focused free model",
  },
  {
    id: "arcee-ai/trinity-large-preview:free",
    name: "Arcee Trinity Large",
    params: "400B MoE (13B active)",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nvidia Nemotron Super",
    params: "120B MoE (12B active, Mamba-Transformer)",
  },
] as const;

type Model = (typeof MODELS)[number];

interface BenchmarkCheck {
  id: string;
  description: string;
  passes: (response: string) => boolean;
}

interface BenchmarkCase {
  id: string;
  title: string;
  prompt: string;
  maxPoints: number;
  checks: BenchmarkCheck[];
}

interface CaseResult {
  caseId: string;
  title: string;
  latencyMs: number;
  passedChecks: string[];
  failedChecks: string[];
  score: number;
  maxPoints: number;
  responseKind: "content" | "reasoning_only" | "empty";
  response: string;
  error: string | null;
}

interface ModelResult {
  model: string;
  modelId: string;
  params: string;
  caseResults: CaseResult[];
  totalScore: number;
  maxScore: number;
  avgLatencyMs: number;
  errorCount: number;
}

function countListItems(text: string): number {
  const listMatches = text.match(/(^|\n)\s*(?:[-*]|\d+\.)\s+/g);
  return listMatches?.length ?? 0;
}

function hasThreeTests(text: string): boolean {
  return countListItems(text) >= 3 || (text.match(/\btest\b/gi)?.length ?? 0) >= 3;
}

const CASES: BenchmarkCase[] = [
  {
    id: "architecture",
    title: "CGC Architecture Strategy",
    prompt: `You are advising on Bushel Board, a Next.js 16 + Supabase app for prairie grain analytics.

Facts you must use:
- Next.js 16: params is a Promise and cookies() is async.
- Supabase PostgREST silently truncates responses above 1000 rows.
- CGC producer deliveries must use this exact formula:
  Primary.Deliveries for AB, SK, MB, BC with grade=''
  + Process.Producer Deliveries at national level with grade=''
  + Producer Cars.Shipments for AB, SK, MB with grade=''
- When combining worksheets, FULL OUTER JOIN is required so grains present in only one source are not dropped.

Task:
Recommend the cleanest implementation strategy.
Keep it under 220 words.
Include:
1. the architecture choice,
2. the biggest failure mode,
3. three concrete tests.
Avoid fluff.`,
    maxPoints: 5,
    checks: [
      {
        id: "full-outer-join",
        description: "Mentions FULL OUTER JOIN",
        passes: (response) => /full outer join/i.test(response),
      },
      {
        id: "grade-blank-filter",
        description: "Mentions grade='' aggregate rows",
        passes: (response) => /grade\s*=\s*''|grade=''|empty grade|blank grade/i.test(response),
      },
      {
        id: "rpc-or-sql",
        description: "Pushes aggregation server-side via RPC/SQL/view/function",
        passes: (response) => /rpc|server-side|sql function|database function|postgres function|view/i.test(response),
      },
      {
        id: "postgrest-limit",
        description: "Calls out the 1000-row truncation risk",
        passes: (response) => /1000|truncat/i.test(response),
      },
      {
        id: "three-tests",
        description: "Provides three concrete tests",
        passes: (response) => hasThreeTests(response),
      },
    ],
  },
  {
    id: "security-review",
    title: "Supabase Client Review",
    prompt: `Review this code for the 4 highest-severity Bushel Board issues and give a short fix strategy.
Keep it under 180 words.

\`\`\`ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function voteSignal(
  userId: string,
  signalId: string,
  vote: "relevant" | "not_relevant",
) {
  return supabase.rpc("record_signal_vote", {
    p_user_id: userId,
    p_signal_id: signalId,
    p_vote: vote,
  });
}
\`\`\`

Bushel rules:
- Service role must never reach the browser.
- Farmer-only writes must be enforced in both server actions and RLS.
- User-scoped RPCs must derive identity from auth.uid().
- Browser clients use createBrowserClient with the anon key only.`,
    maxPoints: 4,
    checks: [
      {
        id: "service-role-browser",
        description: "Flags service role exposure in the browser",
        passes: (response) => /service role|never.*browser|must never.*browser/i.test(response),
      },
      {
        id: "anon-key-browser",
        description: "Says browser client should use anon key",
        passes: (response) => /anon key|NEXT_PUBLIC_SUPABASE_ANON_KEY/i.test(response),
      },
      {
        id: "auth-uid",
        description: "Rejects caller-supplied user ID in favor of auth.uid()",
        passes: (response) => /auth\.uid\(\)|caller-supplied user id|do not accept.*user id/i.test(response),
      },
      {
        id: "server-action-rls",
        description: "Calls for server-side write path plus RLS",
        passes: (response) => /server action|server-side|row level security|RLS/i.test(response),
      },
    ],
  },
  {
    id: "nextjs-review",
    title: "Next.js 16 SSR Review",
    prompt: `Review this Next.js 16 server code. Identify the 3 framework bugs and show the minimal fix outline.
Keep it under 160 words.

\`\`\`ts
import { cookies } from "next/headers";

export default async function GrainPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const cookieStore = cookies();

  return <div>{slug}:{cookieStore.get("region")?.value}</div>;
}
\`\`\`

Bushel uses Next.js 16 App Router.`,
    maxPoints: 4,
    checks: [
      {
        id: "params-promise",
        description: "Recognizes params is now a Promise",
        passes: (response) => /params.*promise|await params/i.test(response),
      },
      {
        id: "cookies-async",
        description: "Recognizes cookies() must be awaited",
        passes: (response) => /await cookies\(\)|cookies\(\).*async/i.test(response),
      },
      {
        id: "type-fix",
        description: "Fixes the params type",
        passes: (response) => /Promise<\{\s*slug:\s*string\s*\}>|params:\s*Promise/i.test(response),
      },
      {
        id: "slug-await",
        description: "Awaits params before reading slug",
        passes: (response) => /const\s*\{\s*slug\s*\}\s*=\s*await params|await params.*slug/i.test(response),
      },
    ],
  },
  {
    id: "sql-debug",
    title: "Producer Deliveries SQL Debug",
    prompt: `This SQL is wrong for Bushel Board country producer deliveries:

\`\`\`sql
SELECT
  p.crop_year,
  p.grain_week,
  p.grain,
  p.ktonnes + pr.ktonnes AS producer_deliveries
FROM primary_deliveries p
JOIN process_deliveries pr
  ON pr.crop_year = p.crop_year
 AND pr.grain_week = p.grain_week
 AND pr.grain = p.grain
WHERE p.crop_year = '2025-2026'
  AND p.grain_week = 30
  AND p.region IN ('AB', 'SK', 'MB', 'BC');
\`\`\`

Explain the bug and show a corrected SQL skeleton in under 220 words.`,
    maxPoints: 5,
    checks: [
      {
        id: "full-outer-join",
        description: "Replaces JOIN with FULL OUTER JOIN",
        passes: (response) => /full outer join/i.test(response),
      },
      {
        id: "producer-cars",
        description: "Adds Producer Cars shipments as the third source",
        passes: (response) => /producer cars/i.test(response),
      },
      {
        id: "grade-blank",
        description: "Filters aggregate rows with grade=''",
        passes: (response) => /grade\s*=\s*''|grade=''|empty grade|blank grade/i.test(response),
      },
      {
        id: "coalesce",
        description: "Uses COALESCE or null-safe aggregation",
        passes: (response) => /coalesce/i.test(response),
      },
      {
        id: "country-vs-national",
        description: "Calls out national/country-level Process data",
        passes: (response) => /national|country-level|country level/i.test(response),
      },
    ],
  },
];

async function callModel(
  model: Model,
  prompt: string,
): Promise<{
  latencyMs: number;
  response: string;
  responseKind: "content" | "reasoning_only" | "empty";
  error: string | null;
}> {
  const startTime = performance.now();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bushelboard.com",
        "X-Title": "Bushel Board Coding Benchmark",
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: "system",
            content: "You are a precise senior TypeScript and Supabase engineer. Prefer concise, technical answers over generic advice.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        latencyMs,
        response: "",
        responseKind: "empty" as const,
        error: `HTTP ${response.status}: ${errorText.slice(0, 300)}`,
      };
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning?: string | null;
        };
      }>;
    };

    const message = payload.choices?.[0]?.message;
    const content = message?.content?.trim() ?? "";
    const reasoning = message?.reasoning?.trim() ?? "";

    if (content) {
      return {
        latencyMs,
        response: content,
        responseKind: "content",
        error: null,
      };
    }

    if (reasoning) {
      return {
        latencyMs,
        response: "",
        responseKind: "reasoning_only",
        error: "Model returned reasoning tokens without a final answer.",
      };
    }

    return {
      latencyMs,
      response: "",
      responseKind: "empty",
      error: null,
    };
  } catch (error) {
    return {
      latencyMs: Math.round(performance.now() - startTime),
      response: "",
      responseKind: "empty",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCase(model: Model, benchmarkCase: BenchmarkCase): Promise<CaseResult> {
  const result = await callModel(model, benchmarkCase.prompt);

  if (result.error) {
    return {
      caseId: benchmarkCase.id,
      title: benchmarkCase.title,
      latencyMs: result.latencyMs,
      passedChecks: [],
      failedChecks: benchmarkCase.checks.map((check) => check.description),
      score: 0,
      maxPoints: benchmarkCase.maxPoints,
      responseKind: result.responseKind,
      response: "",
      error: result.error,
    };
  }

  const passedChecks = benchmarkCase.checks
    .filter((check) => check.passes(result.response))
    .map((check) => check.description);

  const failedChecks = benchmarkCase.checks
    .filter((check) => !check.passes(result.response))
    .map((check) => check.description);

  return {
    caseId: benchmarkCase.id,
    title: benchmarkCase.title,
    latencyMs: result.latencyMs,
    passedChecks,
    failedChecks,
    score: passedChecks.length,
    maxPoints: benchmarkCase.maxPoints,
    responseKind: result.responseKind,
    response: result.response,
    error: null,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function summarizeModel(model: Model, caseResults: CaseResult[]): ModelResult {
  const totalScore = caseResults.reduce((sum, result) => sum + result.score, 0);
  const maxScore = caseResults.reduce((sum, result) => sum + result.maxPoints, 0);
  const avgLatencyMs = average(caseResults.map((result) => result.latencyMs));
  const errorCount = caseResults.filter((result) => result.error).length;

  return {
    model: model.name,
    modelId: model.id,
    params: model.params,
    caseResults,
    totalScore,
    maxScore,
    avgLatencyMs,
    errorCount,
  };
}

async function main() {
  console.error("=== Bushel Board Coding Model Benchmark ===\n");
  console.error("Testing Step 3.5 Flash, Arcee Trinity Large, and Nvidia Nemotron Super on Bushel-specific engineering tasks.\n");

  const summaries: ModelResult[] = [];

  for (const model of MODELS) {
    console.error(`${"=".repeat(80)}`);
    console.error(`MODEL: ${model.name} (${model.params})`);
    console.error(`${"=".repeat(80)}`);

    const caseResults: CaseResult[] = [];

    for (const benchmarkCase of CASES) {
      const caseResult = await runCase(model, benchmarkCase);
      caseResults.push(caseResult);

      console.error(`\nCASE: ${benchmarkCase.title}`);
      console.error(`Latency: ${caseResult.latencyMs}ms | Score: ${caseResult.score}/${caseResult.maxPoints}`);

      if (caseResult.error) {
        console.error(`ERROR: ${caseResult.error}`);
        console.error(`Response kind: ${caseResult.responseKind}`);
        continue;
      }

      console.error(`Passed: ${caseResult.passedChecks.join("; ") || "none"}`);
      console.error(`Missed: ${caseResult.failedChecks.join("; ") || "none"}`);
      console.error(`${"-".repeat(80)}`);
      console.error(caseResult.response);
    }

    const summary = summarizeModel(model, caseResults);
    summaries.push(summary);

    console.error(`\nSUMMARY FOR ${model.name}`);
    console.error(`Total score: ${summary.totalScore}/${summary.maxScore}`);
    console.error(`Average latency: ${summary.avgLatencyMs}ms`);
    console.error(`Errors: ${summary.errorCount}`);
    console.error();
  }

  const ranking = [...summaries]
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      if (left.errorCount !== right.errorCount) {
        return left.errorCount - right.errorCount;
      }
      return left.avgLatencyMs - right.avgLatencyMs;
    })
    .map((summary, index) => ({
      rank: index + 1,
      model: summary.model,
      score: summary.totalScore,
      maxScore: summary.maxScore,
      avgLatencyMs: summary.avgLatencyMs,
      errorCount: summary.errorCount,
    }));

  console.error(`${"=".repeat(80)}`);
  console.error("FINAL RANKING");
  console.error(`${"=".repeat(80)}`);
  for (const item of ranking) {
    console.error(`${item.rank}. ${item.model} - ${item.score}/${item.maxScore} points, avg latency ${item.avgLatencyMs}ms, errors ${item.errorCount}`);
  }

  console.log(JSON.stringify({
    benchmark: "bushel-board-coding-assistant",
    timestamp: new Date().toISOString(),
    cases: CASES.map((benchmarkCase) => ({
      id: benchmarkCase.id,
      title: benchmarkCase.title,
      maxPoints: benchmarkCase.maxPoints,
      checks: benchmarkCase.checks.map((check) => check.description),
    })),
    results: summaries.map((summary) => ({
      model: summary.model,
      modelId: summary.modelId,
      params: summary.params,
      totalScore: summary.totalScore,
      maxScore: summary.maxScore,
      avgLatencyMs: summary.avgLatencyMs,
      errorCount: summary.errorCount,
      caseResults: summary.caseResults.map((caseResult) => ({
        caseId: caseResult.caseId,
        title: caseResult.title,
        latencyMs: caseResult.latencyMs,
        score: caseResult.score,
        maxPoints: caseResult.maxPoints,
        responseKind: caseResult.responseKind,
        passedChecks: caseResult.passedChecks,
        failedChecks: caseResult.failedChecks,
        error: caseResult.error,
      })),
    })),
    ranking,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${String(error)}`);
  process.exit(1);
});
