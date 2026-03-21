#!/usr/bin/env npx tsx
/**
 * Claude vs Grok Debate — Round 2
 *
 * Claude challenges Grok's fresh pipeline scores on the 4 biggest divergences.
 * Grok has x_search + web_search via Responses API (or Chat Completions fallback).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error("Missing XAI_API_KEY");
  process.exit(1);
}

const ROUND2_PROMPT = `You are Grok, the Senior Grain Analyst. You just ran a fresh analysis of Canadian prairie grains for Week 31 (2025-2026) and produced these stance scores.

Claude, another AI analyst, is now CHALLENGING four of your scores because they contradict verified price data. You must either DEFEND your score with specific X posts or web sources you can find right now, or CONCEDE and adjust your score.

IMPORTANT: Search X and the web to find evidence for your position. Don't just argue from theory — find REAL posts, articles, or data. If you can't find evidence to support your score, you MUST concede.

## YOUR SCORES BEING CHALLENGED

### 1. OATS: You scored +25 (Bullish). Claude scored -55 (Bearish).
CLAUDE'S CHALLENGE: "Your +25 is indefensible. Here's the evidence:
- Cash price: $142.00 CAD/T at Bunge Moose Jaw — DEAD FLAT for 5+ consecutive days
- CBOT oats: $3.56/bu and FALLING (-1.25% this week)
- Exports: 25.9% of AAFC target — worst export pace in the portfolio
- Record crop: 3,920 KT production
- Deliveries surged +79% WoW in Week 31
- Per our Debate Rule 14: dead-flat price = no demand pull, cannot rate bullish
Find me ONE piece of evidence — a cash bid increase, an export sale, a vessel loading — that justifies bullish oats right now. If you can't, concede."

### 2. WHEAT: You scored -35 (Bearish). Claude scored +35 (Bullish).
CLAUDE'S CHALLENGE: "You flipped from +25 to -35 in one run. The price evidence says you're wrong:
- Cash CWRS: $276.25 CAD/T — UP $6.36 TODAY (March 18 opening)
- MGEX HRS futures: $6.24/bu — strong
- Exports: Record pace +8.6% YoY (Canadian wheat exports hit 13.03 MMT)
- S2U: 8.6% — well below the 15% threshold that triggers pre-seeding rallies
- Seaway opens March 22-25, adding Thunder Bay as export channel
- SaskWheat report (March 9): 'strongest wheat futures, highest Saskatchewan cash bids since fall 2025'
- HRS specs: +15,990 net long (23.3% OI) — growing but not extreme
The ONLY bearish factor is the rising Canadian dollar pressuring cash conversions. That's a headwind, not a reversal. Search X for 'Canadian wheat exports record' or 'prairie wheat cash bids' — the evidence is bullish."

### 3. PEAS: You scored -35 (Bearish). Claude scored +35 (Bullish).
CLAUDE'S CHALLENGE: "China removed its 100% tariff on Canadian peas effective March 1, 2026. This is the single most important policy change for Canadian pulses this crop year. The evidence:
- Cash yellow peas: $298.06 — UP $4.41 on March 17 (only pulse showing price life)
- 2026 intended acres: DOWN 12.3% (bullish supply signal)
- Annualized export pace exceeds AAFC target
- Per our grain-specific rule: 'India/China import policy is the single largest swing factor for peas'
Search X for 'China Canada pea tariff March 2026' — the tariff removal is confirmed and structural. How can you be bearish on peas when the single largest demand driver just flipped positive?"

### 4. FLAXSEED: You scored -25 (Bearish). Claude scored +50 (Bullish).
CLAUDE'S CHALLENGE: "Flaxseed has the tightest farmer-holding pattern in our portfolio:
- Cash: $670.54 CAD/T — UP $20 this month (was $650.54 on March 2)
- Farmer deliveries: -18% vs 5-year average (farmers are withholding)
- Commercial stocks: Only 44.9 KT (extremely low)
- FOB bids: $16-16.50/bu (firm)
- Week 31 deliveries dropped -43% WoW (further tightening)
Per our book knowledge: 'slow deliveries at firm prices signal farmer confidence — they believe prices will go higher.' The combination of farmer withholding + low commercial stocks + rising cash = textbook bullish. Search X for 'flax prices Canada' — what bearish evidence do you have?"

## YOUR TASK

For EACH of the 4 grains:
1. Search X and web for evidence supporting YOUR score
2. Present what you found
3. Either DEFEND with specific evidence, or CONCEDE and give a revised score

Format:
**GRAIN: DEFEND [score] or CONCEDE → [new score]**
X evidence: [specific posts/articles you found]
Reasoning: [2-3 sentences]

Be honest. If Claude's price evidence is stronger, say so. Farmers need accurate signals, not ego.`;

async function callGrok() {
  // Try Responses API first (has x_search), fall back to Chat Completions
  const endpoints = [
    {
      name: "Responses API (grok-4.20-reasoning + tools)",
      url: "https://api.x.ai/v1/responses",
      body: {
        model: "grok-4.20-reasoning",
        instructions: "You are Grok, a grain market analyst. Use x_search and web_search to find REAL evidence before responding. Be specific about what you find.",
        input: ROUND2_PROMPT,
        tools: [{ type: "web_search" }, { type: "x_search" }],
        temperature: 0.5,
      },
      extract: (data: any) => {
        const items = data.output || [];
        let text = "";
        let toolCalls = 0;
        for (const item of items) {
          if (item.type === "message") {
            for (const c of item.content || []) {
              if (c.type === "output_text") text += c.text;
            }
          }
          if (["web_search_call", "x_search_call"].includes(item.type)) toolCalls++;
        }
        return { text, toolCalls };
      },
    },
    {
      name: "Chat Completions (grok-3)",
      url: "https://api.x.ai/v1/chat/completions",
      body: {
        model: "grok-3",
        messages: [
          {
            role: "system",
            content: "You are Grok, a Senior Grain Market Analyst. Claude is challenging your analysis with verified price data. You must either defend with specific evidence or concede. Be honest — farmers depend on accurate signals."
          },
          { role: "user", content: ROUND2_PROMPT }
        ],
        temperature: 0.5,
        max_tokens: 4000,
      },
      extract: (data: any) => ({
        text: data.choices?.[0]?.message?.content || "",
        toolCalls: 0,
      }),
    },
  ];

  for (const ep of endpoints) {
    console.error(`Trying ${ep.name}...`);
    const startTime = Date.now();

    try {
      const response = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify(ep.body),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`${ep.name} failed: ${response.status} ${err.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const { text, toolCalls } = ep.extract(data);

      console.error(`\nGrok responded via ${ep.name} in ${elapsed}s`);
      if (toolCalls > 0) console.error(`Grok used ${toolCalls} search tool calls.`);
      console.log(text);
      return;
    } catch (err) {
      console.error(`${ep.name} error: ${err}`);
      continue;
    }
  }

  console.error("All endpoints failed.");
  process.exit(1);
}

callGrok().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
