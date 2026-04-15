#!/usr/bin/env npx tsx
/**
 * xAI Search Helper — For macro-scout agent
 *
 * Calls the xAI Responses API with web_search or x_search tools
 * and returns results to stdout as JSON. Designed to be invoked by
 * the macro-scout agent via Bash tool during the Friday grain swarm.
 *
 * Usage:
 *   npx tsx scripts/xai-search.ts "Canada wheat export tariff news"
 *   npx tsx scripts/xai-search.ts "canola market bullish" --x-search
 *   npx tsx scripts/xai-search.ts --help
 *
 * Output: JSON to stdout, diagnostics to stderr.
 * Idempotent: read-only search, no side effects.
 *
 * Environment variables (from .env.local):
 *   XAI_API_KEY    xAI API key (same as Supabase secret)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local ──────────────────────────────────────────────────
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local may not exist in all environments
}

// ── CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
xAI Search Helper — For macro-scout agent

Usage:
  npx tsx scripts/xai-search.ts "query"             Web search (default)
  npx tsx scripts/xai-search.ts "query" --x-search   X/Twitter search
  npx tsx scripts/xai-search.ts --help               Show this help

Environment variables (from .env.local):
  XAI_API_KEY    xAI API key

Output: JSON to stdout with search results.
`);
  process.exit(0);
}

const useXSearch = args.includes("--x-search");
const query = args.filter((a) => !a.startsWith("--"))[0];

if (!query) {
  console.error("Error: query argument required");
  console.error('Usage: npx tsx scripts/xai-search.ts "your search query"');
  process.exit(1);
}

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  console.error("Error: XAI_API_KEY not set in environment or .env.local");
  process.exit(1);
}

// ── xAI Responses API call ───────────────────────────────────────────

async function xaiSearch(
  searchQuery: string,
  searchType: "web_search" | "x_search"
): Promise<void> {
  const toolName = searchType;
  const systemPrompt =
    searchType === "web_search"
      ? "You are a research assistant. Search the web for the given query and return a concise summary of the most relevant findings. Focus on facts, dates, and key developments. Return results as JSON with fields: results (array of {title, summary, source, date})."
      : "You are a market intelligence assistant. Search X/Twitter for the given query and return a concise summary of relevant market discussions. Focus on sentiment, key claims, and notable accounts. Return results as JSON with fields: results (array of {author, summary, sentiment, date}).";

  console.error(`Searching ${toolName} for: "${searchQuery}"`);

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini-fast",
      tools: [{ type: toolName }],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: searchQuery },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`xAI API error (${response.status}): ${errorText}`);
    // Return empty results on failure — macro-scout handles gracefully
    console.log(
      JSON.stringify({
        query: searchQuery,
        search_type: searchType,
        error: `API error ${response.status}`,
        results: [],
      })
    );
    process.exit(0);
  }

  const data = await response.json();

  // Extract the text output and citations from the Responses API format
  let outputText = "";
  const citations: Array<{ url: string; title?: string }> = [];

  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && item.content) {
        for (const block of item.content) {
          if (block.type === "output_text") {
            outputText += block.text;
          }
        }
      }
    }
  }

  // Extract citations if present (Responses API includes them at top level)
  if (data.citations && Array.isArray(data.citations)) {
    for (const cite of data.citations) {
      citations.push({ url: cite.url, title: cite.title });
    }
  }

  const result = {
    query: searchQuery,
    search_type: searchType,
    model: "grok-3-mini-fast",
    output: outputText,
    citations: citations.length > 0 ? citations : undefined,
    usage: data.usage ?? null,
  };

  console.log(JSON.stringify(result, null, 2));
  console.error(
    `Done. Tokens: ${data.usage?.total_tokens ?? "unknown"}`
  );
}

// ── Main ─────────────────────────────────────────────────────────────
xaiSearch(query, useXSearch ? "x_search" : "web_search").catch((err) => {
  console.error("Fatal error:", err.message);
  console.log(
    JSON.stringify({
      query,
      search_type: useXSearch ? "x_search" : "web_search",
      error: err.message,
      results: [],
    })
  );
  process.exit(1);
});
