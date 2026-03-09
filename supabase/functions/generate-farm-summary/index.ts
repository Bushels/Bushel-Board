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
 *   { "crop_year": "2025-26", "grain_week": 29, "batch_size": 50, "user_ids": ["uuid1", "uuid2"] }
 *
 * If user_ids is provided, only those users are processed (used by self-trigger for batching).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";
const DEFAULT_BATCH_SIZE = 50;

const SYSTEM_PROMPT =
  "You are a concise agricultural market analyst writing personalized farm summaries for Canadian prairie farmers. Write 2-4 sentences. Be specific with numbers. Use a warm but professional tone. When relevant X/Twitter posts about their grains are found, briefly mention market sentiment.";

interface CropPlan {
  user_id: string;
  crop_year: string;
  grain: string;
  acres_seeded: number;
  volume_left_to_sell_kt: number | null;
  deliveries: { date: string; amount_kt: number; destination?: string }[];
}

interface PercentileRow {
  user_id: string;
  grain: string;
  total_delivered_kt: number;
  delivery_pace_pct: number;
  percentile_rank: number;
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const xaiKey = Deno.env.get("XAI_API_KEY");
    if (!xaiKey) {
      return new Response(
        JSON.stringify({ error: "XAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const batchSize: number = body.batch_size || DEFAULT_BATCH_SIZE;
    const targetUserIds: string[] | undefined = body.user_ids;

    console.log(
      `Generating farm summaries for week ${grainWeek}, crop year ${cropYear}, batch size ${batchSize}${targetUserIds ? `, ${targetUserIds.length} specific users` : ""}`
    );

    // 1. Get crop plans — either for specific users (batched self-trigger) or all users
    let cropPlansQuery = supabase
      .from("crop_plans")
      .select("user_id, crop_year, grain, acres_seeded, volume_left_to_sell_kt, deliveries")
      .eq("crop_year", cropYear);

    if (targetUserIds) {
      cropPlansQuery = cropPlansQuery.in("user_id", targetUserIds);
    }

    const { data: cropPlans, error: plansError } = await cropPlansQuery;

    if (plansError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch crop plans: ${plansError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!cropPlans || cropPlans.length === 0) {
      return new Response(
        JSON.stringify({ message: "No crop plans found for this crop year", crop_year: cropYear }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Call calculate_delivery_percentiles() via RPC
    const { data: percentiles, error: percError } = await supabase.rpc(
      "calculate_delivery_percentiles",
      { p_crop_year: cropYear }
    );

    if (percError) {
      console.error("Percentile calculation error:", percError.message);
      // Continue without percentiles — summaries can still be generated
    }

    // Build percentile lookup: user_id -> grain -> percentile data
    const percentileLookup = new Map<string, Map<string, PercentileRow>>();
    for (const row of (percentiles ?? []) as PercentileRow[]) {
      if (!percentileLookup.has(row.user_id)) {
        percentileLookup.set(row.user_id, new Map());
      }
      percentileLookup.get(row.user_id)!.set(row.grain, row);
    }

    // 3. Group plans by user
    const plansByUser = new Map<string, CropPlan[]>();
    for (const plan of cropPlans as CropPlan[]) {
      if (!plansByUser.has(plan.user_id)) {
        plansByUser.set(plan.user_id, []);
      }
      plansByUser.get(plan.user_id)!.push(plan);
    }

    // If user_ids were provided (self-trigger), use them directly; otherwise derive from crop plans
    const allUserIds = targetUserIds || Array.from(plansByUser.keys());
    const totalUsers = allUserIds.length;
    const batchUserIds = allUserIds.slice(0, batchSize);
    const remainingUserIds = allUserIds.slice(batchSize);

    if (totalUsers > batchSize) {
      console.log(
        `Processing ${batchSize} of ${totalUsers} users. ${remainingUserIds.length} remaining will be self-triggered.`
      );
    }

    // 4. For each user in batch: generate summary via Grok
    const results: { user_id: string; status: string; error?: string }[] = [];

    for (const userId of batchUserIds) {
      try {
        const userPlans = plansByUser.get(userId)!;
        const userPercentiles = percentileLookup.get(userId);

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
            (m.content ?? []).filter((c: { type: string }) => c.type === "output_text").map((c: { text: string }) => c.text)
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

        // Build percentiles object for storage
        const percentilesObj: Record<string, number> = {};
        if (userPercentiles) {
          for (const [grain, pRow] of userPercentiles) {
            percentilesObj[grain] = Math.round(pRow.percentile_rank * 10) / 10;
          }
        }

        // 5. Upsert into farm_summaries
        const { error: upsertError } = await supabase
          .from("farm_summaries")
          .upsert(
            {
              user_id: userId,
              crop_year: cropYear,
              grain_week: grainWeek,
              summary_text: summaryText,
              percentiles: percentilesObj,
              generated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,crop_year,grain_week" }
          );

        if (upsertError) {
          results.push({
            user_id: userId,
            status: "failed",
            error: upsertError.message,
          });
        } else {
          results.push({ user_id: userId, status: "success" });
        }
      } catch (err) {
        results.push({
          user_id: userId,
          status: "failed",
          error: String(err).slice(0, 200),
        });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;

    console.log(
      `Farm summary generation complete: ${succeeded} ok, ${failed} failed, ${totalUsers} total users (${duration}ms)`
    );

    // Self-trigger for remaining users (mirrors generate-intelligence batch pattern)
    if (remainingUserIds.length > 0) {
      console.log(`${remainingUserIds.length} users remaining — triggering next batch`);
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-farm-summary`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              crop_year: cropYear,
              grain_week: grainWeek,
              batch_size: batchSize,
              user_ids: remainingUserIds,
            }),
          }
        );
        console.log("Triggered next batch of farm summaries");
      } catch (err) {
        console.error("Next batch self-trigger failed:", err);
      }
    }

    return new Response(
      JSON.stringify({
        results,
        duration_ms: duration,
        succeeded,
        failed,
        total_users: totalUsers,
        batch_size: batchSize,
        remaining: remainingUserIds.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-farm-summary error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// --- Helpers ---

/** Returns crop year in short format: "2025-26" (matches app convention). */
function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${endYear.toString().padStart(2, "0")}`;
}

/** Approximate grain week number (1-52) since Aug 1 start of crop year. */
function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start =
    month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  return Math.max(
    1,
    Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  );
}

/** Build user prompt for GPT-4o with crop plan data and percentile rankings. */
function buildFarmSummaryPrompt(
  plans: CropPlan[],
  percentiles?: Map<string, PercentileRow>
): string {
  const lines: string[] = [
    "Here is this farmer's current crop plan and delivery data:\n",
  ];

  for (const plan of plans) {
    const deliveryCount = plan.deliveries?.length ?? 0;
    const totalDelivered =
      plan.deliveries?.reduce(
        (sum, d) => sum + (Number(d.amount_kt) || 0),
        0
      ) ?? 0;

    const perc = percentiles?.get(plan.grain);
    const percStr = perc
      ? ` | Delivery pace percentile: ${Math.round(perc.percentile_rank)}th (ranked by % of planned volume delivered)`
      : "";

    const remainingStr =
      plan.volume_left_to_sell_kt != null
        ? ` | Remaining to sell: ${plan.volume_left_to_sell_kt} Kt`
        : "";

    lines.push(
      `- ${plan.grain}: ${plan.acres_seeded} acres seeded | ${deliveryCount} deliveries totalling ${totalDelivered.toFixed(2)} Kt${remainingStr}${percStr}`
    );
  }

  lines.push("");
  lines.push(
    "Please provide: (1) delivery progress highlights, (2) how this farmer compares to peers via percentile rankings, and (3) any actionable observations for the weeks ahead."
  );

  return lines.join("\n");
}

/** Returns ISO8601 date strings for the past 7 days (for x_search tool). */
function getXSearchDateRange(): { from_date: string; to_date: string } {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from_date: weekAgo.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
  };
}
