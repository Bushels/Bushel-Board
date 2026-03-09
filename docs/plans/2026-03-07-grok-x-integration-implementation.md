# Grok API + X Agriculture Tweets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace OpenAI GPT-4o with xAI Grok Responses API in both Edge Functions, adding real-time X agriculture tweet search to grain intelligence and farm summaries.

**Architecture:** Both Edge Functions switch from `api.openai.com/v1/chat/completions` to `api.x.ai/v1/responses` with `x_search` tool for real-time tweet context. Structured outputs (json_schema) remain for intelligence; farm summaries stay plain text.

**Tech Stack:** Supabase Edge Functions (Deno), xAI Grok API (Responses endpoint), `grok-4-1-fast-reasoning` model

**Design Doc:** `docs/plans/2026-03-07-grok-x-integration-design.md`

---

### Task 1: Set XAI_API_KEY in Supabase Edge Function Secrets

**Files:**
- Modify: `bushel-board-app/.env.local` (add `XAI_API_KEY`)

**Step 1: Set the secret on Supabase production**

Run:
```bash
cd ../bushel-board-app && npx supabase secrets set XAI_API_KEY="xai-YOUR_KEY_HERE" --project-ref ibgsloyjxdopkvwqcqwh
```

Expected: `Secret XAI_API_KEY has been set`

**Step 2: Add to local .env.local**

Add this line to `bushel-board-app/.env.local`:
```
XAI_API_KEY=xai-YOUR_KEY_HERE
```

**Step 3: Verify secret is set**

Run:
```bash
npx supabase secrets list --project-ref ibgsloyjxdopkvwqcqwh
```

Expected: Output includes `XAI_API_KEY` in the list

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: add XAI_API_KEY to env config"
```

Note: `.env.local` is gitignored — this commit is only if other files changed. If nothing changed, skip.

---

### Task 2: Update generate-intelligence prompt template for X search

**Files:**
- Modify: `bushel-board-app/supabase/functions/generate-intelligence/prompt-template.ts`

**Step 1: Update the signal taxonomy comment and add "social" signal type**

In `prompt-template.ts`, update the file header comment at lines 1-9:

```typescript
/**
 * Prompt template for generating grain market intelligence.
 *
 * Designed by: innovation-agent
 * Signal taxonomy:
 *   - bullish: data supports price strength / farmer holding thesis
 *   - bearish: data suggests price weakness / urgency to sell
 *   - watch: noteworthy but directionally ambiguous
 *   - social: signal derived from X/Twitter market sentiment
 */
```

**Step 2: Update buildIntelligencePrompt to instruct Grok to use X search**

Replace the `buildIntelligencePrompt` function body. The system context paragraph (first line of the template string) becomes:

```typescript
export function buildIntelligencePrompt(ctx: GrainContext): string {
  const deliveredPct = ctx.total_supply_kt && ctx.total_supply_kt > 0
    ? ((ctx.cy_deliveries_kt / ctx.total_supply_kt) * 100).toFixed(1)
    : "N/A";

  return `You are a grain market analyst writing intelligence briefings for Canadian prairie farmers (Alberta, Saskatchewan, Manitoba). Your tone is direct, data-driven, and actionable — like a Bloomberg terminal meets a coffee shop conversation with a sharp grain buyer.

You have access to real-time X (Twitter) search. Search X for recent posts about ${ctx.grain} market conditions in Canada — look for farmer sentiment, elevator bids, export activity, analyst commentary, and weather impacts. Reference specific posts when they provide meaningful market signal.

## Data for ${ctx.grain} — Week ${ctx.grain_week}, Crop Year ${ctx.crop_year}

### Current Week
- Producer Deliveries: ${ctx.cw_deliveries_kt} Kt (WoW: ${ctx.wow_deliveries_pct !== null ? ctx.wow_deliveries_pct + "%" : "N/A"})
- Commercial Stocks: ${ctx.commercial_stocks_kt} Kt (WoW change: ${ctx.wow_stocks_change_kt > 0 ? "+" : ""}${ctx.wow_stocks_change_kt} Kt)

### Crop Year to Date
- CY Deliveries: ${ctx.cy_deliveries_kt} Kt (YoY: ${ctx.yoy_deliveries_pct !== null ? ctx.yoy_deliveries_pct + "%" : "N/A"}, Prior Year: ${ctx.py_deliveries_kt} Kt)
- CY Exports: ${ctx.cy_exports_kt} Kt (YoY: ${ctx.yoy_exports_pct !== null ? ctx.yoy_exports_pct + "%" : "N/A"}, Prior Year: ${ctx.py_exports_kt} Kt)
- CY Crush/Processing: ${ctx.cy_crush_kt} Kt (YoY: ${ctx.yoy_crush_pct !== null ? ctx.yoy_crush_pct + "%" : "N/A"}, Prior Year: ${ctx.py_crush_kt} Kt)

### Supply Balance (AAFC Estimate)
- Production: ${ctx.production_kt ?? "N/A"} Kt
- Carry-in: ${ctx.carry_in_kt ?? "N/A"} Kt
- Total Supply: ${ctx.total_supply_kt ?? "N/A"} Kt
- Projected Exports: ${ctx.projected_exports_kt ?? "N/A"} Kt
- Projected Crush: ${ctx.projected_crush_kt ?? "N/A"} Kt
- Projected Carry-out: ${ctx.projected_carry_out_kt ?? "N/A"} Kt
- Delivered to Date: ${deliveredPct}% of total supply

## Your Task

Generate a JSON object with the intelligence analysis. Include 3-6 insight cards. Use signal types: "bullish", "bearish", "watch", or "social" (for insights driven by X/Twitter market sentiment). Include at least one "watch" signal. If you found relevant X posts, include at least one "social" signal referencing them. The kpi_data must echo the exact numbers from above — do not invent new metrics.

## Rules
- Every insight MUST reference specific numbers from the data or specific X posts.
- If data is insufficient (e.g. N/A values), note the gap rather than speculating.
- Do NOT give financial advice. Frame insights as "data suggests" or "the numbers show".
- For grains with minimal data (low volumes, few regions), generate fewer insights (2-3).
- If no relevant X posts are found, skip "social" signals — do not fabricate social media references.
- Return ONLY the JSON object.`;
}
```

**Step 3: Commit**

```bash
cd ../bushel-board-app
git add supabase/functions/generate-intelligence/prompt-template.ts
git commit -m "feat: update intelligence prompt for Grok X search and social signals"
```

---

### Task 3: Migrate generate-intelligence from OpenAI to Grok Responses API

**Files:**
- Modify: `bushel-board-app/supabase/functions/generate-intelligence/index.ts`

**Step 1: Update constants and imports**

Replace lines 18-19:

```typescript
// Old:
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

// New:
const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";
```

**Step 2: Update API key check**

Replace lines 30-36:

```typescript
// Old:
const openaiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiKey) {
  return new Response(
    JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}

// New:
const xaiKey = Deno.env.get("XAI_API_KEY");
if (!xaiKey) {
  return new Response(
    JSON.stringify({ error: "XAI_API_KEY not configured" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

**Step 3: Build x_search date range helper**

Add after the `getCurrentGrainWeek()` function at the bottom of the file:

```typescript
/** Returns ISO8601 date strings for the past 7 days (for x_search tool). */
function getXSearchDateRange(): { from_date: string; to_date: string } {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from_date: weekAgo.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
  };
}
```

**Step 4: Replace the OpenAI API call with Grok Responses API call**

Replace lines 107-172 (the `fetch(OPENAI_API_URL, ...)` block and the JSON schema). The full replacement:

```typescript
        const prompt = buildIntelligencePrompt(ctx);
        const { from_date, to_date } = getXSearchDateRange();

        // Call Grok Responses API with x_search tool + structured output
        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            input: [{ role: "user", content: prompt }],
            tools: [
              {
                type: "x_search",
                from_date,
                to_date,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "grain_intelligence",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    thesis_title: { type: "string" },
                    thesis_body: { type: "string" },
                    insights: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          signal: { type: "string", enum: ["bullish", "bearish", "watch", "social"] },
                          title: { type: "string" },
                          body: { type: "string" },
                        },
                        required: ["signal", "title", "body"],
                        additionalProperties: false,
                      },
                    },
                    kpi_data: {
                      type: "object",
                      properties: {
                        cy_deliveries_kt: { type: "number" },
                        cw_deliveries_kt: { type: "number" },
                        wow_deliveries_pct: { type: ["number", "null"] },
                        cy_exports_kt: { type: "number" },
                        yoy_exports_pct: { type: ["number", "null"] },
                        cy_crush_kt: { type: "number" },
                        yoy_crush_pct: { type: ["number", "null"] },
                        commercial_stocks_kt: { type: "number" },
                        wow_stocks_change_kt: { type: "number" },
                        total_supply_kt: { type: ["number", "null"] },
                        delivered_pct: { type: ["number", "null"] },
                        yoy_deliveries_pct: { type: ["number", "null"] },
                      },
                      required: [
                        "cy_deliveries_kt", "cw_deliveries_kt", "wow_deliveries_pct",
                        "cy_exports_kt", "yoy_exports_pct", "cy_crush_kt", "yoy_crush_pct",
                        "commercial_stocks_kt", "wow_stocks_change_kt", "total_supply_kt",
                        "delivered_pct", "yoy_deliveries_pct",
                      ],
                      additionalProperties: false,
                    },
                  },
                  required: ["thesis_title", "thesis_body", "insights", "kpi_data"],
                  additionalProperties: false,
                },
              },
            },
          }),
        });
```

**Step 5: Update response parsing for Grok Responses API format**

Replace lines 174-193 (the response parsing block). The Grok Responses API returns a different structure:

```typescript
        if (!response.ok) {
          const errText = await response.text();
          results.push({ grain: grainName, status: "failed", error: `Grok API ${response.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        const aiResponse = await response.json();

        // Grok Responses API: extract text from output array
        const requestId = aiResponse.id ?? null;
        const usage = aiResponse.usage ?? {};
        const outputMessages = (aiResponse.output ?? []).filter(
          (o: { type: string }) => o.type === "message"
        );
        const content = outputMessages
          .flatMap((m: { content: { type: string; text: string }[] }) =>
            (m.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text)
          )
          .join("");

        // Structured outputs guarantees valid JSON — parse directly
        let intelligence;
        try {
          intelligence = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: `JSON parse failed: ${content.slice(0, 100)}` });
          continue;
        }
```

**Step 6: Update the upsert metadata**

Replace the `model_used` and `llm_metadata` in the upsert block (lines 195-211):

```typescript
        // Upsert into grain_intelligence (includes LLM metadata for observability)
        const { error: upsertError } = await supabase
          .from("grain_intelligence")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: grainWeek,
            thesis_title: intelligence.thesis_title,
            thesis_body: intelligence.thesis_body,
            insights: intelligence.insights,
            kpi_data: intelligence.kpi_data,
            generated_at: new Date().toISOString(),
            model_used: MODEL,
            llm_metadata: {
              request_id: requestId,
              input_tokens: usage.input_tokens ?? null,
              output_tokens: usage.output_tokens ?? null,
              total_tokens: usage.total_tokens ?? null,
            },
          }, {
            onConflict: "grain,crop_year,grain_week",
          });
```

**Step 7: Update error message text**

In the error message at line 176, change `OpenAI API` to `Grok API` (already done in step 5 above).

**Step 8: Update the file header comment**

Replace lines 1-13:

```typescript
/**
 * Supabase Edge Function: generate-intelligence
 *
 * After weekly CGC data import, generates AI market intelligence for each grain.
 * Calls xAI Grok Responses API per grain with x_search for real-time X/Twitter
 * agriculture sentiment. Stores results in grain_intelligence table.
 *
 * Triggered by import-cgc-weekly on success, or manually via POST.
 *
 * Request body (optional):
 *   { "crop_year": "2025-26", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, generates for all 16 Canadian grains.
 */
```

**Step 9: Commit**

```bash
git add supabase/functions/generate-intelligence/index.ts
git commit -m "feat: migrate generate-intelligence from OpenAI to Grok Responses API with x_search"
```

---

### Task 4: Migrate generate-farm-summary from OpenAI to Grok Responses API

**Files:**
- Modify: `bushel-board-app/supabase/functions/generate-farm-summary/index.ts`

**Step 1: Update constants**

Replace lines 16-18:

```typescript
// Old:
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

// New:
const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";
```

**Step 2: Update system prompt to mention X sentiment**

Replace lines 20-21:

```typescript
// Old:
const SYSTEM_PROMPT =
  "You are a concise agricultural market analyst writing personalized farm summaries for Canadian prairie farmers. Write 2-4 sentences. Be specific with numbers. Use a warm but professional tone.";

// New:
const SYSTEM_PROMPT =
  "You are a concise agricultural market analyst writing personalized farm summaries for Canadian prairie farmers. Write 2-4 sentences. Be specific with numbers. Use a warm but professional tone. When relevant X/Twitter posts about their grains are found, briefly mention market sentiment.";
```

**Step 3: Update API key check**

Replace lines 48-54:

```typescript
// Old:
const openaiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiKey) {
  return new Response(
    JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}

// New:
const xaiKey = Deno.env.get("XAI_API_KEY");
if (!xaiKey) {
  return new Response(
    JSON.stringify({ error: "XAI_API_KEY not configured" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

**Step 4: Add x_search date range helper**

Add after the `buildFarmSummaryPrompt` function at the bottom of the file:

```typescript
/** Returns ISO8601 date strings for the past 7 days (for x_search tool). */
function getXSearchDateRange(): { from_date: string; to_date: string } {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from_date: weekAgo.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
  };
}
```

**Step 5: Replace the API call**

Replace lines 134-148 (the `fetch(OPENAI_API_URL, ...)` block):

```typescript
        const prompt = buildFarmSummaryPrompt(userPlans, userPercentiles);
        const { from_date, to_date } = getXSearchDateRange();

        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            input: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            tools: [
              {
                type: "x_search",
                from_date,
                to_date,
              },
            ],
          }),
        });
```

**Step 6: Update response parsing**

Replace lines 150-171 (the response parsing block):

```typescript
        if (!response.ok) {
          const errText = await response.text();
          results.push({
            user_id: userId,
            status: "failed",
            error: `Grok API ${response.status}: ${errText.slice(0, 200)}`,
          });
          continue;
        }

        const aiResponse = await response.json();

        // Grok Responses API: extract text from output array
        const outputMessages = (aiResponse.output ?? []).filter(
          (o: { type: string }) => o.type === "message"
        );
        const summaryText = outputMessages
          .flatMap((m: { content: { type: string; text: string }[] }) =>
            (m.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text)
          )
          .join("")
          .trim();

        if (!summaryText) {
          results.push({
            user_id: userId,
            status: "failed",
            error: "Empty response from Grok",
          });
          continue;
        }
```

**Step 7: Update the file header comment**

Replace lines 1-12:

```typescript
/**
 * Supabase Edge Function: generate-farm-summary
 *
 * Generates personalized weekly farm summaries for users with active crop plans.
 * Uses delivery percentile rankings to compare farmers against peers.
 * Calls xAI Grok Responses API per user with x_search for market sentiment.
 * Stores results in farm_summaries table.
 *
 * Triggered manually via POST, or chained after generate-intelligence.
 *
 * Request body (optional):
 *   { "crop_year": "2025-26", "grain_week": 29, "batch_size": 50 }
 */
```

**Step 8: Commit**

```bash
git add supabase/functions/generate-farm-summary/index.ts
git commit -m "feat: migrate generate-farm-summary from OpenAI to Grok Responses API with x_search"
```

---

### Task 5: Add database migration for model_used default

**Files:**
- Create: `bushel-board-app/supabase/migrations/20260307100000_grok_model_default.sql`

**Step 1: Write the migration**

```sql
-- Switch model_used default from gpt-4o to grok-4-1-fast-reasoning (xAI Grok migration)
ALTER TABLE grain_intelligence
  ALTER COLUMN model_used SET DEFAULT 'grok-4-1-fast-reasoning';
```

**Step 2: Apply migration**

Run:
```bash
cd ../bushel-board-app && npx supabase db push --project-ref ibgsloyjxdopkvwqcqwh
```

Expected: Migration applied successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/20260307100000_grok_model_default.sql
git commit -m "chore: update grain_intelligence model_used default to grok-4-1-fast-reasoning"
```

---

### Task 6: Update UI InsightCard to handle "social" signal type

**Files:**
- Modify: `bushel-board-app/app/grains/[slug]/` (the component that renders insight cards)

**Step 1: Find the InsightCard component**

Search for files that render the `signal` field from insights (bullish/bearish/watch). The component likely maps signal types to colors/icons.

Look in:
- `bushel-board-app/components/intelligence/` or similar
- `bushel-board-app/app/grains/[slug]/page.tsx`

**Step 2: Add "social" to the signal type mapping**

Wherever the signal mapping exists (e.g. a switch or object lookup), add:

```typescript
// Existing:
// bullish -> green / arrow-up
// bearish -> red / arrow-down
// watch -> amber / eye

// Add:
social: {
  color: "text-blue-500",    // or use a design token
  bgColor: "bg-blue-50",
  icon: "MessageCircle",      // or appropriate icon from lucide-react
  label: "Social",
}
```

The exact implementation depends on how the current signal mapping is structured. Match the existing pattern.

**Step 3: Update the GrainIntelligence TypeScript interface**

In `bushel-board-app/lib/queries/intelligence.ts`, update the signal type:

```typescript
// Old:
insights: Array<{ signal: "bullish" | "bearish" | "watch"; title: string; body: string }>;

// New:
insights: Array<{ signal: "bullish" | "bearish" | "watch" | "social"; title: string; body: string }>;
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add social signal type to InsightCard for X/Twitter-driven insights"
```

---

### Task 7: Deploy Edge Functions and test

**Step 1: Deploy both Edge Functions**

Run:
```bash
cd ../bushel-board-app
npx supabase functions deploy generate-intelligence --project-ref ibgsloyjxdopkvwqcqwh
npx supabase functions deploy generate-farm-summary --project-ref ibgsloyjxdopkvwqcqwh
```

Expected: Both deploy successfully.

**Step 2: Test generate-intelligence for a single grain**

Run:
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/generate-intelligence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -d '{"crop_year": "2025-26", "grain_week": 29, "grains": ["Canola"]}'
```

Expected: JSON response with `"status": "success"` for Canola. Check that:
- Response includes thesis with X/Twitter references
- `model_used` is `grok-4-1-fast-reasoning` in the database
- `llm_metadata` has `input_tokens` and `output_tokens`

**Step 3: Verify in database**

Run SQL in Supabase:
```sql
SELECT grain, thesis_title, model_used, llm_metadata,
       insights->0->>'signal' as first_signal
FROM grain_intelligence
WHERE grain = 'Canola' AND crop_year = '2025-26'
ORDER BY generated_at DESC LIMIT 1;
```

Expected: `model_used` = `grok-4-1-fast-reasoning`, insights may include `"social"` signal.

**Step 4: Test full 16-grain run**

Run:
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/generate-intelligence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -d '{"crop_year": "2025-26", "grain_week": 29}'
```

Expected: All 16 grains succeed. Check the chain trigger fires `generate-farm-summary`.

**Step 5: Commit any fixes found during testing**

```bash
git add -A && git commit -m "fix: address issues found during Grok API testing"
```

---

### Task 8: Clean up OpenAI references and update docs

**Files:**
- Modify: `bushel-board-app/supabase/config.toml` (remove openai_api_key line if present)
- Modify: `CLAUDE.md` (update Intelligence Pipeline section)

**Step 1: Update CLAUDE.md intelligence pipeline section**

Change all references:
- `gpt-4o` -> `grok-4-1-fast-reasoning`
- `OpenAI API` -> `xAI Grok API`
- Add mention of X/Twitter search capability

**Step 2: Remove OPENAI_API_KEY from Supabase secrets (after confirming Grok works)**

Run:
```bash
npx supabase secrets unset OPENAI_API_KEY --project-ref ibgsloyjxdopkvwqcqwh
```

**Step 3: Update supabase/config.toml if it references OpenAI**

Remove or comment out any `openai_api_key = "env(OPENAI_API_KEY)"` line. Add:
```toml
xai_api_key = "env(XAI_API_KEY)"
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up OpenAI references, update docs for Grok migration"
```

---

### Task 9: Deploy to Vercel and verify end-to-end

**Step 1: Build and deploy**

Run:
```bash
cd ../bushel-board-app && npm run build && npx vercel --prod --yes
```

Expected: Build succeeds, deploy completes.

**Step 2: Verify grain detail pages show updated intelligence**

Navigate to a grain detail page (e.g., `/grains/canola`) and verify:
- Thesis banner shows updated narrative (may reference X/Twitter sentiment)
- Insight cards display correctly (including any "social" signal cards)
- KPI data is correct

**Step 3: Final commit**

```bash
git add -A && git commit -m "chore: Grok API migration complete — verified end-to-end"
```
