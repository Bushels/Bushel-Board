#!/usr/bin/env npx tsx
/**
 * Benchmark three free OpenRouter models for the Kitchen Table Advisor voice layer.
 *
 * Tests: Arcee Trinity Large, Nvidia Nemotron Super, Nvidia Nemotron 70B
 * Each model gets the same realistic grain advisor prompt with farmer context.
 * Measures: latency (TTFT + total), output quality, voice naturalness.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-chat-models.ts
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-chat-models.ts --help
 *
 * Output: JSON summary to stdout, full responses + timing to stderr.
 */

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Benchmark Chat Models — Kitchen Table Advisor Voice Layer

Usage:
  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/benchmark-chat-models.ts

Tests three free models on the same grain advisor prompt:
  1. Arcee Trinity Large (400B MoE, 13B active)
  2. Nvidia Nemotron Super (120B MoE, 12B active, Mamba-Transformer)
  3. Nvidia Nemotron 70B (70B dense, HelpSteer2 RLHF)

Measures latency, output quality, and voice naturalness.
`);
  process.exit(0);
}

// Load .env.local
import { readFileSync } from "fs";
import { resolve } from "path";
try {
  const envContent = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* env file optional if vars already set */ }

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("ERROR: Set OPENROUTER_API_KEY in .env.local or environment.");
  process.exit(1);
}

const MODELS = [
  {
    id: "arcee-ai/trinity-large-preview:free",
    name: "Arcee Trinity Large",
    params: "400B MoE (13B active)",
    apiKey: process.env.OPENROUTER_API_KEY_ARCEE || OPENROUTER_API_KEY,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nvidia Nemotron Super",
    params: "120B MoE (12B active, Mamba-Transformer)",
    apiKey: process.env.OPENROUTER_API_KEY_NEMOTRON || OPENROUTER_API_KEY,
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct:free",
    name: "Nvidia Nemotron 70B",
    params: "70B dense",
    apiKey: process.env.OPENROUTER_API_KEY_NEMOTRON || OPENROUTER_API_KEY,
  },
];

const VOICE_SYSTEM_PROMPT = `You are a sharp, experienced prairie farm advisor sitting at the kitchen table with a neighbor. You grew up around grain — you know what it's like to watch basis widen during harvest, to wonder if you should have sold last week, to stare at bins full of canola and wonder what the right move is.

You've read every CGC report, you follow the futures markets, you know the books on grain marketing inside and out. But you talk like a farmer, not a trader.

VOICE RULES:
- Say "still in bins" not "on-farm inventory"
- Say "haul it" not "accelerate deliveries"
- Say "basis is working your way" not "basis is narrowing favorably"
- Say "the pipeline is hungry for grain" not "commercial demand is elevated"
- Say "that's a lot of eggs in one basket" not "concentration risk is high"
- Never use: "delve", "tapestry", "landscape", "synergy", "leverage" (as a verb), "robust"
- Keep paragraphs short — 2-3 sentences max
- Use specific numbers from the analysis

You naturally remind the farmer that you're sharing market analysis through an AI framework — not handing out formal financial advice. The final call on when to sell always rests with them. Weave this in conversationally, not as a legal block.

You are reviewing a structured analysis from a quantitative analyst. Your job:
1. VALIDATE: Does the logic check out? If stocks are drawing but the analyst says "bearish," fix it
2. REWRITE: Convert the structured analysis into natural kitchen-table conversation
3. PERSONALIZE: Reference the farmer's specific numbers
4. TIMELINE: Every recommendation includes a specific timeframe and trigger event
5. RISK: End with the main risk to the recommendation

Never say "the analyst found" — speak as one unified advisor.`;

const TEST_USER_MESSAGE = `The farmer asked: "Should I hold my canola or start hauling some to the elevator?"

Here is the structured analysis from the data review:
{
  "data_summary": "Canola CY deliveries at 8,450 Kt (YoY -12%). Commercial stocks drawing for 3rd consecutive week (-85 Kt WoW). Vancouver port at 104% capacity. Crush running at 5,120 Kt CY (+3% YoY).",
  "knowledge_applied": "Basis Signal Matrix: Narrowing basis + drawing stocks = pipeline hungry for grain. Storage Decision Algorithm: carry charge negative at current futures curve. Flow Coherence Rule: stocks drawing while deliveries high = system absorbing supply = structurally bullish.",
  "sentiment_context": "72% of platform farmers holding canola this week (45 votes). Only 15% hauling. This collective holding is restricting commercial supply and historically precedes basis narrowing of 15-25%.",
  "recommendation": "price",
  "recommendation_reasoning": "Farmer has 500 acres with 0 Kt contracted and is in the 90th percentile for delivery pace. Strong position but fully exposed to downside. Basis narrowing window likely 2-3 weeks before Southern Hemisphere harvest pressure arrives. Recommend pricing 15-20% via deferred delivery to lock in current basis advantage.",
  "confidence": "high",
  "confidence_gaps": "No real-time basis quotes available. Producer car allocations not yet updated for this week.",
  "follow_up_questions": ["Do you have any existing forward contracts or deferred delivery agreements?"]
}

Here is the farmer's context:
Canola: 500 acres, 0.8 Kt delivered, 0 Kt contracted, 1.2 Kt uncontracted, 90th percentile

Platform sentiment: Canola: 72% holding, 15% hauling (45 votes)

Rewrite the analysis as a kitchen-table conversation with this farmer. Be specific with their numbers. Sound like a neighbor, not a banker.`;

interface BenchmarkResult {
  model: string;
  modelId: string;
  params: string;
  latencyMs: number;
  ttftMs: number | null;
  outputTokens: number;
  tokensPerSecond: number;
  response: string;
  error: string | null;
}

async function benchmarkModel(model: typeof MODELS[number]): Promise<BenchmarkResult> {
  const startTime = performance.now();
  let ttftMs: number | null = null;
  let fullResponse = "";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${model.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bushelboard.com",
        "X-Title": "Bushel Board Model Benchmark",
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: "system", content: VOICE_SYSTEM_PROMPT },
          { role: "user", content: TEST_USER_MESSAGE },
        ],
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content ?? "";
              if (content) {
                if (ttftMs === null) {
                  ttftMs = performance.now() - startTime;
                }
                fullResponse += content;
              }
            } catch {
              // Skip malformed SSE
            }
          }
        }
      }
    }

    const totalMs = performance.now() - startTime;
    // Rough token estimate: ~4 chars per token
    const estimatedTokens = Math.ceil(fullResponse.length / 4);
    const generationTimeS = (totalMs - (ttftMs ?? 0)) / 1000;

    return {
      model: model.name,
      modelId: model.id,
      params: model.params,
      latencyMs: Math.round(totalMs),
      ttftMs: ttftMs ? Math.round(ttftMs) : null,
      outputTokens: estimatedTokens,
      tokensPerSecond: generationTimeS > 0 ? Math.round(estimatedTokens / generationTimeS) : 0,
      response: fullResponse,
      error: null,
    };
  } catch (error) {
    return {
      model: model.name,
      modelId: model.id,
      params: model.params,
      latencyMs: Math.round(performance.now() - startTime),
      ttftMs: null,
      outputTokens: 0,
      tokensPerSecond: 0,
      response: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// AI slop detection
const SLOP_WORDS = [
  "delve", "tapestry", "landscape", "synergy", "leverage", "robust",
  "multifaceted", "holistic", "paradigm", "ecosystem", "streamline",
  "proactive", "stakeholder", "in today's", "it's important to note",
  "let me break this down", "great question",
];

function detectSlop(text: string): string[] {
  const lower = text.toLowerCase();
  return SLOP_WORDS.filter((word) => lower.includes(word));
}

// Farmer language detection
const FARMER_PHRASES = [
  "still in bins", "haul", "basis", "elevator", "the pipeline",
  "contracted", "acres", "crop year", "percentile", "Kt",
  "eggs in one basket", "lock in", "pricing", "deferred delivery",
];

function detectFarmerLanguage(text: string): string[] {
  const lower = text.toLowerCase();
  return FARMER_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

async function main() {
  console.error("=== Kitchen Table Advisor — Voice Layer Model Benchmark ===\n");
  console.error("Testing 3 models with identical grain advisor prompt...\n");

  // Run all three in parallel
  const results = await Promise.all(MODELS.map(benchmarkModel));

  // Print each response
  for (const result of results) {
    console.error(`\n${"=".repeat(80)}`);
    console.error(`MODEL: ${result.model} (${result.params})`);
    console.error(`ID: ${result.modelId}`);
    console.error(`TTFT: ${result.ttftMs ?? "N/A"}ms | Total: ${result.latencyMs}ms | Tokens/s: ${result.tokensPerSecond}`);

    if (result.error) {
      console.error(`ERROR: ${result.error}`);
      continue;
    }

    const slopWords = detectSlop(result.response);
    const farmerPhrases = detectFarmerLanguage(result.response);

    console.error(`AI Slop detected: ${slopWords.length > 0 ? slopWords.join(", ") : "NONE (good!)"}`);
    console.error(`Farmer language: ${farmerPhrases.length}/${FARMER_PHRASES.length} phrases (${farmerPhrases.join(", ")})`);
    console.error(`Response length: ${result.response.length} chars (~${result.outputTokens} tokens)`);
    console.error(`${"─".repeat(80)}`);
    console.error(result.response);
  }

  // Summary comparison
  const summary = results.map((r) => ({
    model: r.model,
    params: r.params,
    ttft_ms: r.ttftMs,
    total_ms: r.latencyMs,
    tokens_per_second: r.tokensPerSecond,
    output_tokens: r.outputTokens,
    slop_count: r.error ? null : detectSlop(r.response).length,
    farmer_phrase_count: r.error ? null : detectFarmerLanguage(r.response).length,
    farmer_phrase_max: FARMER_PHRASES.length,
    has_disclaimer: r.error ? null : /final call|your call|not.*financial advice|do your own/i.test(r.response),
    has_timeline: r.error ? null : /\d+.*week|this week|next \d+|by \w+day/i.test(r.response),
    has_specific_numbers: r.error ? null : /500 acres|90th|72%|104%|0\.8|1\.2/i.test(r.response),
    error: r.error,
  }));

  console.error(`\n${"=".repeat(80)}`);
  console.error("SUMMARY COMPARISON");
  console.error(`${"=".repeat(80)}`);
  for (const s of summary) {
    console.error(`\n${s.model}:`);
    console.error(`  Speed: TTFT ${s.ttft_ms ?? "ERR"}ms, Total ${s.total_ms}ms, ${s.tokens_per_second} tok/s`);
    console.error(`  Voice: ${s.slop_count ?? "ERR"} slop words, ${s.farmer_phrase_count ?? "ERR"}/${s.farmer_phrase_max} farmer phrases`);
    console.error(`  Quality: disclaimer=${s.has_disclaimer}, timeline=${s.has_timeline}, specific_numbers=${s.has_specific_numbers}`);
  }

  // Output JSON to stdout
  console.log(JSON.stringify({ benchmark: "kitchen-table-advisor-voice-layer", timestamp: new Date().toISOString(), results: summary }, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${String(error)}`);
  process.exit(1);
});
