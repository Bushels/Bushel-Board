/**
 * Supabase Edge Function: generate-farm-summary
 *
 * Generates personalized weekly farm summaries for users with active crop plans.
 * Uses marketing percentile rankings to compare farmers against peers.
 * Calls xAI Grok Responses API per user with x_search for market sentiment.
 * Stores results in farm_summaries table.
 *
 * Triggered manually via POST, or chained after generate-intelligence.
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 29, "batch_size": 50, "user_ids": ["uuid1", "uuid2"] }
 *
 * If user_ids is provided, only those users are processed (used by self-trigger for batching).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enqueueInternalFunction,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import { requireV1Enabled } from "../_shared/v1-gate.ts";
import {
  buildFarmSummarySystemPrompt,
  buildDataContextPreamble,
} from "../_shared/market-intelligence-config.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.20-reasoning";
const DEFAULT_BATCH_SIZE = 5;
const POUNDS_PER_METRIC_TONNE = 2204.6226218488;
// Keys MUST match the 16 canonical DB grain names in cgc_observations / market_analysis.
// Verified 2026-04-17: "Sunflower" (not "Sunflower Seed"), "Canaryseed" (one word),
// "Chick Peas" (two words), "Amber Durum" (not "Durum"), "Beans" (not "Edible Beans").
const DEFAULT_BUSHEL_WEIGHTS: Record<string, number> = {
  Wheat: 60,
  "Amber Durum": 60,
  Canola: 50,
  Barley: 48,
  Oats: 34,
  Peas: 60,
  Lentils: 60,
  Flaxseed: 56,
  Soybeans: 60,
  Corn: 56,
  Rye: 56,
  "Mustard Seed": 50,
  Canaryseed: 50,
  "Chick Peas": 60,
  Sunflower: 30,
  Beans: 60,
};

const SYSTEM_PROMPT = buildFarmSummarySystemPrompt();

interface CropPlan {
  user_id: string;
  crop_year: string;
  grain: string;
  acres_seeded: number;
  starting_grain_kt: number | null;
  bushel_weight_lbs: number | null;
  inventory_unit_preference: "metric_tonnes" | "bushels" | "pounds" | null;
  volume_left_to_sell_kt: number | null;
  contracted_kt: number | null;
  uncontracted_kt: number | null;
  deliveries: { date: string; amount_kt: number; destination?: string }[];
}

interface PercentileRow {
  user_id: string;
  grain: string;
  total_delivered_kt: number;
  delivery_pace_pct: number;
  percentile_rank: number;
}

interface CommunityAnalyticsRow {
  grain: string;
  farmer_count: number;
  mean_pace_pct: number;
  mean_priced_pct: number;
  mean_contracted_pct: number;
  mean_open_pct: number;
  mean_left_to_sell_pct: number;
  contracting_farmer_pct: number;
}

Deno.serve(async (req) => {
  const authError = requireInternalRequest(req);
  if (authError) {
    return authError;
  }

  const v1Blocked = requireV1Enabled("generate-farm-summary");
  if (v1Blocked) return v1Blocked;

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

    let cropPlansQuery = supabase
      .from("crop_plans")
      .select("user_id, crop_year, grain, acres_seeded, starting_grain_kt, bushel_weight_lbs, inventory_unit_preference, volume_left_to_sell_kt, contracted_kt, uncontracted_kt, deliveries")
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

    const { data: percentiles, error: percError } = await supabase.rpc(
      "calculate_delivery_percentiles",
      { p_crop_year: cropYear }
    );

    if (percError) {
      console.error("Percentile calculation error:", percError.message);
    }

    const { data: communityAnalytics, error: analyticsError } = await supabase.rpc(
      "get_delivery_analytics",
      { p_crop_year: cropYear, p_grain: null }
    );

    if (analyticsError) {
      console.error("Community analytics error:", analyticsError.message);
    }

    const percentileLookup = new Map<string, Map<string, PercentileRow>>();
    for (const row of (percentiles ?? []) as PercentileRow[]) {
      if (!percentileLookup.has(row.user_id)) {
        percentileLookup.set(row.user_id, new Map());
      }
      percentileLookup.get(row.user_id)!.set(row.grain, row);
    }

    const analyticsLookup = new Map<string, CommunityAnalyticsRow>();
    for (const row of (communityAnalytics ?? []) as CommunityAnalyticsRow[]) {
      analyticsLookup.set(row.grain, row);
    }

    const plansByUser = new Map<string, CropPlan[]>();
    for (const plan of cropPlans as CropPlan[]) {
      if (!plansByUser.has(plan.user_id)) {
        plansByUser.set(plan.user_id, []);
      }
      plansByUser.get(plan.user_id)!.push(plan);
    }

    const allUserIds = targetUserIds || Array.from(plansByUser.keys());
    const totalUsers = allUserIds.length;
    const batchUserIds = allUserIds.slice(0, batchSize);
    const remainingUserIds = allUserIds.slice(batchSize);

    if (totalUsers > batchSize) {
      console.log(
        `Processing ${batchSize} of ${totalUsers} users. ${remainingUserIds.length} remaining will be self-triggered.`
      );
    }

    const results: { user_id: string; status: string; error?: string }[] = [];

    for (const userId of batchUserIds) {
      try {
        const userPlans = plansByUser.get(userId)!;
        const userPercentiles = percentileLookup.get(userId);
        const prompt = buildFarmSummaryPrompt(
          userPlans,
          userPercentiles,
          analyticsLookup,
          cropYear,
          grainWeek
        );
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
        const outputMessages = (aiResponse.output ?? []).filter(
          (o: { type: string }) => o.type === "message"
        );
        const summaryText = outputMessages
          .flatMap((m: { content: { type: string; text: string }[] }) =>
            (m.content ?? [])
              .filter((c: { type: string }) => c.type === "output_text")
              .map((c: { text: string }) => c.text)
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

        const percentilesObj: Record<string, number> = {};
        if (userPercentiles) {
          for (const [grain, pRow] of userPercentiles) {
            percentilesObj[grain] = Math.round(pRow.percentile_rank * 10) / 10;
          }
        }

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

    if (remainingUserIds.length > 0) {
      console.log(`${remainingUserIds.length} users remaining - triggering next batch`);
      try {
        await enqueueInternalFunction(supabase, "generate-farm-summary", {
          crop_year: cropYear,
          grain_week: grainWeek,
          batch_size: batchSize,
          user_ids: remainingUserIds,
        });
        console.log("Triggered next batch of farm summaries");
      } catch (err) {
        console.error("Next batch self-trigger failed:", err);
      }
    } else {
      // Final batch complete — chain to validate-site-health (step 6)
      try {
        console.log("All farm summaries complete — triggering site health check...");
        await enqueueInternalFunction(supabase, "validate-site-health", {
          crop_year: cropYear,
          grain_week: grainWeek,
          source: "pipeline",
        });
        console.log("Triggered validate-site-health");
      } catch (healthErr) {
        console.error("validate-site-health chain-trigger failed:", healthErr);
        // Don't fail farm summaries — health check is best-effort
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

/** Returns crop year in long format: "2025-2026" (matches CGC CSV and cgc_observations convention). */
function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

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

function buildFarmSummaryPrompt(
  plans: CropPlan[],
  percentiles?: Map<string, PercentileRow>,
  analyticsByGrain?: Map<string, CommunityAnalyticsRow>,
  cropYear?: string,
  grainWeek?: number,
): string {
  const lines: string[] = [];
  const currentShippingWeek = grainWeek ? grainWeek + 1 : undefined;

  // Add temporal context preamble if week info is available
  if (cropYear && grainWeek) {
    lines.push(buildDataContextPreamble(grainWeek, cropYear));
    lines.push("");
  }

  lines.push("Here is this farmer's current crop plan and delivery data (reported through the current shipping week):\n");

  for (const plan of plans) {
    const deliveryCount = plan.deliveries?.length ?? 0;
    const totalDelivered =
      plan.deliveries?.reduce(
        (sum, d) => sum + (Number(d.amount_kt) || 0),
        0
      ) ?? 0;
    const startingKt = Math.max(
      Number(plan.starting_grain_kt ?? 0),
      Number(plan.volume_left_to_sell_kt ?? 0),
      0
    );
    const bushelWeightLbs = Math.max(
      Number(
        plan.bushel_weight_lbs ?? DEFAULT_BUSHEL_WEIGHTS[plan.grain] ?? 60
      ),
      0.0001
    );
    const remainingKt = Math.min(
      Number(plan.volume_left_to_sell_kt ?? 0),
      startingKt
    );
    const contractedKt = Math.min(Number(plan.contracted_kt ?? 0), remainingKt);
    const uncontractedKt = Math.max(remainingKt - contractedKt, 0);
    const marketedKt = Math.max(startingKt - remainingKt, 0);
    const pricedKt = marketedKt + contractedKt;
    const leftToSellPct =
      startingKt > 0 ? ((remainingKt / startingKt) * 100).toFixed(1) : "0.0";
    const pricedPct =
      startingKt > 0 ? ((pricedKt / startingKt) * 100).toFixed(1) : "0.0";
    const contractedPct =
      startingKt > 0 ? ((contractedKt / startingKt) * 100).toFixed(1) : "0.0";
    const tonnesPerAcre =
      plan.acres_seeded > 0 ? (startingKt * 1000) / plan.acres_seeded : 0;
    const bushelsPerAcre =
      plan.acres_seeded > 0
        ? ((startingKt * 1000 * POUNDS_PER_METRIC_TONNE) / bushelWeightLbs) /
          plan.acres_seeded
        : 0;

    const perc = percentiles?.get(plan.grain);
    const percStr = perc
      ? ` | Marketing pace percentile: ${Math.round(perc.percentile_rank)}th (ranked by % of estimated starting grain already priced or moved)`
      : "";

    const positionStr =
      startingKt > 0
        ? ` | Starting grain: ${startingKt.toFixed(2)} Kt | Estimated yield: ${bushelsPerAcre.toFixed(1)} bu/ac (${tonnesPerAcre.toFixed(2)} t/ac) | Left to sell: ${remainingKt.toFixed(2)} Kt (${leftToSellPct}% left) | Priced: ${pricedKt.toFixed(2)} Kt (${pricedPct}%) | Contracted: ${contractedKt.toFixed(2)} Kt (${contractedPct}%) | Open: ${uncontractedKt.toFixed(2)} Kt`
        : "";

    const unitPreferenceStr = plan.inventory_unit_preference
      ? ` | Farmer enters crop amounts in ${plan.inventory_unit_preference.replace("_", " ")}`
      : "";

    const analytics = analyticsByGrain?.get(plan.grain);
    const communityStr = analytics
      ? ` | Community avg: ${analytics.mean_priced_pct.toFixed(1)}% priced, ${analytics.mean_contracted_pct.toFixed(1)}% contracted, ${analytics.mean_left_to_sell_pct.toFixed(1)}% still left to sell | Contract users: ${analytics.contracting_farmer_pct.toFixed(1)}% of ${analytics.farmer_count} farmers`
      : "";

    lines.push(
      `- ${plan.grain}: ${plan.acres_seeded} acres seeded | ${deliveryCount} deliveries totalling ${totalDelivered.toFixed(2)} Kt${positionStr}${unitPreferenceStr}${percStr}${communityStr}`
    );
  }

  lines.push("");
  lines.push("Write the response in Markdown using short section headings and bullet points, not a single long paragraph.");

  // Multi-grain farmers get grain-first structure; single-grain uses topic-first
  const grainNames = plans.map((p) => p.grain);
  if (grainNames.length > 1) {
    lines.push(`This farmer grows ${grainNames.length} grains. Organize the summary BY GRAIN so each crop is clearly separated.`);
    lines.push("Use this section structure:");
    for (const name of grainNames) {
      lines.push(`## ${name}`);
      lines.push(`- Flow data, logistics, futures positioning, and farm position specific to ${name}. 3-5 bullets.`);
    }
    lines.push("## Weeks Ahead");
    lines.push(
      `- 2-3 concrete cross-grain actions or watch items for Week ${currentShippingWeek ?? "N"} with a catalyst and the main risk.`
    );
  } else {
    lines.push("Use this section order when the evidence exists and omit empty sections:");
    lines.push("## Confirmed Flow Data");
    lines.push(
      `- Start with what is already confirmed in lagged official flow data such as CGC Week ${grainWeek ?? "N"}.`
    );
    lines.push("## Forward Logistics");
    lines.push(
      "- Separate rail staging, producer cars, and vessel lineup from confirmed shipped tonnage. Treat them as forward-looking logistics signals."
    );
    lines.push("## Futures Positioning");
    lines.push(
      "- Include Commitment of Traders only when data is available, and remind the farmer it is Tuesday positions released Friday."
    );
    lines.push("## Your Farm Position");
    lines.push(
      "- Explain delivery pace, percentile ranking, contracted grain, open grain, and any useful peer comparison."
    );
    lines.push("## Weeks Ahead");
    lines.push(
      `- Give 2-3 concrete actions or watch items for Week ${currentShippingWeek ?? "N"} with a catalyst and the main risk.`
    );
  }
  lines.push("");
  lines.push("Hard rules:");
  lines.push("- Format the weekly summary as concise bullet points (3-7 bullets per section). Each bullet should be actionable or informative. Do NOT write long paragraphs.");
  lines.push("- Each bullet should make one concrete point and stay under 2 sentences.");
  lines.push("- Label the source week or date whenever you cite a market signal.");
  lines.push("- If anonymized community stats are present, explain what the broader farmer cohort is doing in pricing, contracting, and leaving grain open.");
  lines.push("- If a source is unavailable or unverified, say nothing about it rather than guessing.");
  lines.push("- Do not repeat the card title with another summary heading.");
  lines.push("- Put any sources at the end under 'Sources:' as bullet items.");

  return lines.join("\n");
}

function getXSearchDateRange(): { from_date: string; to_date: string } {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from_date: weekAgo.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
  };
}
