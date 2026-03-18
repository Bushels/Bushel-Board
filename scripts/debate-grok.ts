#!/usr/bin/env npx tsx
/**
 * Claude vs Grok Debate Script
 *
 * Sends Claude's independent grain thesis to Grok via xAI Responses API
 * with full reasoning enabled + x_search + web_search tools.
 * Grok debates each grain with its own data access.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error("Missing XAI_API_KEY in .env");
  process.exit(1);
}

const DEBATE_PROMPT = `You are Grok, a Senior Grain Market Analyst specializing in Canadian prairie grain markets. You have access to real-time X posts and web search.

Claude (another AI analyst) has formed independent stance scores for 10 Canadian prairie grains for Week 31 of the 2025-2026 crop year. Your job is to DEBATE each position — AGREE or CHALLENGE with specific evidence.

IMPORTANT: Use your x_search and web_search tools to verify current market conditions. Check X for the latest posts about Canadian grain prices, canola crush margins, wheat export pace, and any breaking news. Search the web for AAFC, CGC, or port authority updates.

## CLAUDE'S POSITIONS (March 18, 2026)

### PRICES (verified March 17-18)
- CWRS Wheat cash: C$276.25/t (+$6.36 today). MGEX HRS: US$6.24/bu
- Canola: ICE May $726.66 CAD/T. Moose Jaw cash $662.33 = $64 basis gap
- CBOT Corn: $4.54/bu flat. Soybeans: $11.57/bu. Oats: $3.56/bu (-1.25%)
- Feed Barley cash: $232.01 flat. Flax: $670.54 (+$20 this month)
- Amber Durum: $278.59 flat. Red Lentils: $547.50 flat. Yellow Peas: $298.06 (+$4.41)

### COT (CFTC March 10)
- Canola: MM +95,152 (25.7% OI), Comm -81,433. MASSIVE spec/commercial divergence.
- Soybeans: MM +222,107 (17.0% OI). Most crowded single position.
- Corn: MM +193,271 (+140,297 WoW!!). Most dramatic weekly spec buying.
- HRS Wheat: MM +15,990 (23.3% OI). Moderate but growing.

### CLAUDE'S STANCE SCORES (-100 bearish to +100 bullish)

1. WHEAT: +35. Record exports +8.6% YoY. S2U 8.6% tight. Seaway opens Mar 22-25. Loonie headwind on cash but physical demand strong. HRS specs 23.3% OI moderate.

2. CANOLA: +10. China tariff relief real but unconfirmed in flow data. $64 basis gap = elevators NOT competing. MM +95K at 25.7% OI extremely crowded. Cash FELL $6.60 from Friday. Paper rally not reaching farmers.

3. BARLEY: +15. Exports +78% YoY impressive. Cash dead flat $232 = no price response. 2026 acres +6% bearish new-crop. Limited upside near term.

4. OATS: -55. Cash $142 dead flat. CBOT falling. Record 3,920 KT crop. Exports 25.9% of target. Stocks building. Textbook bearish.

5. PEAS: +35. China 100% tariff removed Mar 1. Cash up $4.41. Acres -12.3% bullish supply. Only pulse showing price life. Structural catalyst.

6. CORN: -40. CBOT flat $4.54. Exports 16.6% of target = broken. MM +193K with +140K WoW = speculative frenzy disconnected from Canadian fundamentals.

7. FLAXSEED: +50. Cash +$20 this month (slow grind). Farmers holding (-18% vs avg). Commercial stocks only 44.9 KT. Firm bids $16-16.50/bu.

8. SOYBEANS: -30. Basis inverted = deliver now signal. MM +222K most crowded in portfolio. Exports 67% target (strong). Crush -34% YoY (weak). Paper overhang creates correction risk.

9. AMBER DURUM: -40. Cash $278.59 dead flat. Deliveries 170% of avg = aggressive farmer liquidation. Zero price response from buyers.

10. LENTILS: -50. Cash $547.50 flat. Exports 44% target. Stocks building. No catalyst anywhere.

## YOUR TASK

For EACH grain:
1. Search X for the latest posts about that grain (Canadian context)
2. AGREE with Claude's score OR CHALLENGE with your own score and specific evidence
3. Give one concrete farmer action recommendation

Format your response EXACTLY as:

**WHEAT:** AGREE +35 / CHALLENGE → [score]
X findings: [what you found on X]
Evidence: [your reasoning in 2-3 sentences]
Farmer action: [one clear recommendation]

[repeat for all 10 grains]

Be direct. Don't hedge. Prairie farmers are reading this.`;

async function callGrok() {
  // Try Responses API first (has x_search), fall back to Chat Completions
  const endpoints = [
    {
      name: "Responses API (grok-4-1-fast-reasoning + tools)",
      url: "https://api.x.ai/v1/responses",
      body: {
        model: "grok-4-1-fast-reasoning",
        instructions: "You are an expert grain market analyst. Use x_search and web_search to verify current Canadian grain market conditions before responding.",
        input: DEBATE_PROMPT,
        tools: [{ type: "web_search" }, { type: "x_search" }],
        temperature: 0.7,
      },
      extract: (data: any) => {
        const items = data.output || [];
        let text = "";
        for (const item of items) {
          if (item.type === "message") {
            for (const c of item.content || []) {
              if (c.type === "output_text") text += c.text;
            }
          }
        }
        const toolCalls = items.filter((i: any) =>
          ["web_search_call", "x_search_call"].includes(i.type)
        ).length;
        return { text, toolCalls };
      },
    },
    {
      name: "Chat Completions API (grok-3)",
      url: "https://api.x.ai/v1/chat/completions",
      body: {
        model: "grok-3",
        messages: [
          {
            role: "system",
            content: "You are Grok, a Senior Grain Market Analyst specializing in Canadian prairie grain markets. You have deep knowledge of commodity markets, COT positioning, basis mechanics, and seasonal patterns. Be direct and specific in your analysis."
          },
          { role: "user", content: DEBATE_PROMPT }
        ],
        temperature: 0.7,
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
        continue; // try next endpoint
      }

      const data = await response.json();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const { text, toolCalls } = ep.extract(data);

      console.error(`Grok responded via ${ep.name} in ${elapsed}s`);
      if (toolCalls > 0) {
        console.error(`Grok used ${toolCalls} search tool calls.`);
      }
      console.log(text);
      return; // success
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
