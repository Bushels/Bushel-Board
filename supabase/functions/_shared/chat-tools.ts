/**
 * Chat tool definitions + server-side executors.
 * Every tool the LLM can call during a conversation.
 * Tool calls are proposals — validated and executed server-side.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ToolDefinition, ToolCall } from "./llm-adapter.ts";
import { fireLocalIntelTriggers, fireElevatorPriceTriggers as firePostedPriceTriggers } from "./push-triggers.ts";

// ─── Tool Definitions (sent to LLM) ─────────────────

export const CHAT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "save_local_intel",
      description:
        "Save local market intelligence reported by the farmer (basis, elevator pricing, crop conditions, yield estimates). Call this when the farmer mentions specific local market data.",
      parameters: {
        type: "object",
        properties: {
          grain: { type: "string", description: "Grain name (e.g., Wheat, Canola)" },
          data_type: {
            type: "string",
            enum: [
              "basis", "elevator_price", "crop_condition", "yield_estimate", "quality",
              "seeding_progress", "input_price", "weather_observation",
              "harvest_progress", "pest_report", "acres_planned"
            ],
            description: "Type of local market data",
          },
          value_numeric: { type: "number", description: "Numeric value (e.g., -28 for basis)" },
          value_text: { type: "string", description: "Text description (e.g., 'dry conditions')" },
          elevator_name: { type: "string", description: "Elevator name if mentioned" },
          confidence: {
            type: "string",
            enum: ["reported", "inferred"],
            default: "reported",
            description: "'reported' if farmer stated directly, 'inferred' if implied",
          },
        },
        required: ["grain", "data_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_farmer_memory",
      description:
        "Store a persistent fact about this farmer for future conversations (preferred elevator, farm size, primary grains, delivery preferences). Call when farmer reveals personal/farm details.",
      parameters: {
        type: "object",
        properties: {
          memory_key: {
            type: "string",
            description:
              "Canonical key: preferred_elevator, local_basis_last_known, crop_condition_self, farm_size_acres, primary_grains, delivery_preference, equipment, risk_tolerance",
          },
          memory_value: { type: "string", description: "The value to store" },
          grain: { type: "string", description: "Optional grain scope (e.g., for per-grain basis)" },
        },
        required: ["memory_key", "memory_value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_area_stance",
      description:
        "Get the area stance modifier for a grain in the farmer's postal area (FSA). Returns how local conditions differ from the national picture.",
      parameters: {
        type: "object",
        properties: {
          grain: { type: "string", description: "Grain to check area stance for" },
        },
        required: ["grain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_market",
      description:
        "Search market data for a grain. Pulls from CGC, CFTC COT, USDA exports/WASDE/crop progress, X signals, and grain prices.",
      parameters: {
        type: "object",
        properties: {
          grain: { type: "string", description: "Grain to search" },
          sources: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "cgc",
                "cftc_cot",
                "usda_exports",
                "usda_wasde",
                "usda_crop_progress",
                "x_signals",
                "grain_prices",
              ],
            },
            description: "Which data sources to query",
          },
          weeks_back: {
            type: "integer",
            default: 4,
            minimum: 1,
            maximum: 12,
            description: "How many weeks of history to fetch",
          },
        },
        required: ["grain", "sources"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_crop_plan",
      description:
        "Create or update a crop plan entry when a farmer describes their operation (what they grow, how much, contracts).",
      parameters: {
        type: "object",
        properties: {
          grain: { type: "string" },
          crop_year: { type: "string", pattern: "^\\d{4}-\\d{4}$" },
          production_estimate_kt: { type: "number" },
          contracted_kt: { type: "number" },
          uncontracted_kt: { type: "number" },
          target_price_per_tonne: { type: "number" },
          notes: { type: "string", maxLength: 300 },
        },
        required: ["grain", "crop_year"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_daily_prices",
      description:
        "Batch-save daily prices from an operator (elevator, crusher, seed company, fertilizer dealer, chemical company). Parse the operator's price sheet into structured entries. Supports fresh posts and quick-updates. Requires an operator role.",
      parameters: {
        type: "object",
        properties: {
          prices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string", description: "Product or grain name (e.g., 'Wheat', 'Urea 46-0-0')" },
                grade: { type: "string", description: "Grade (e.g., 'CWRS 1', '#1 Canola')" },
                price_per_tonne: { type: "number", description: "Price in $/tonne" },
                price_per_bushel: { type: "number", description: "Price in $/bushel" },
                basis: { type: "number", description: "Basis (e.g., -28)" },
                basis_reference: { type: "string", description: "Reference exchange (e.g., 'ICE Canola')" },
                delivery_period: { type: "string", description: "'spot', 'Oct 2026', 'new crop'" },
                unit: { type: "string", enum: ["tonne", "bushel", "acre", "jug", "bag", "each"], description: "Unit of measure" },
                capacity_notes: { type: "string", description: "Capacity note (e.g., 'need 30t', 'limited space')" },
                delivery_notes: { type: "string", description: "Delivery note (e.g., 'Taking for 2 more days')" },
                special_offer: { type: "string", description: "Promotion (e.g., '10% off until May 15')" },
              },
              required: ["product_name"],
            },
            description: "Array of price entries to post",
          },
          target_fsa_codes: {
            type: "array",
            items: { type: "string" },
            description: "Up to 3 FSA codes where these prices are visible (e.g., ['T0L', 'T0K'])",
            maxItems: 3,
          },
        },
        required: ["prices"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_area_prices",
      description:
        "Get posted prices for a farmer's area. Returns facility names, prices, basis, capacity, delivery notes, and facility status. Used when farmers ask about grain or input prices.",
      parameters: {
        type: "object",
        properties: {
          grain: { type: "string", description: "Optional grain filter (e.g., 'Canola')" },
          business_type: {
            type: "string",
            enum: ["elevator", "crusher", "mill", "terminal", "seed", "fertilizer", "chemical"],
            description: "Optional filter by business type",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_products",
      description:
        "Add or remove products from an operator's catalog. Called when an operator says they're starting to carry a new grain or dropping one.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "remove"], description: "Whether to add or remove the product" },
          product_name: { type: "string", description: "Product or grain name" },
          product_category: { type: "string", description: "Optional category (e.g., 'grain', 'fertilizer', 'seed')" },
        },
        required: ["action", "product_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_demand_analytics",
      description:
        "Show the operator how many farmers queried their prices, broken down by grain with weekly trend.",
      parameters: {
        type: "object",
        properties: {
          days_back: { type: "integer", default: 7, minimum: 1, maximum: 30, description: "Number of days to look back" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_facility_status",
      description:
        "Update the operator's facility-wide status note. Shown to all farmers who ask about prices from this facility.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", maxLength: 200, description: "Facility status note (e.g., 'Taking canola until Wed, wheat starting Thu')" },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_feedback",
      description:
        "Log farmer feedback, frustration events, bug reports, or feature requests for bu/ac. Call this when you detect frustration, when a farmer gives thumbs down, or when they want to tell bu/ac something.",
      parameters: {
        type: "object",
        properties: {
          feedback_type: {
            type: "string",
            enum: ["frustration", "bug_report", "feature_request", "praise", "correction"],
            description: "Type of feedback being logged",
          },
          farmer_message: {
            type: "string",
            description: "What the farmer said or wants bu/ac to know",
          },
          bushy_context: {
            type: "string",
            description: "What Bushy was trying to do when the issue occurred",
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Severity of the issue. Use 'high' for repeated frustration or data errors.",
          },
        },
        required: ["feedback_type"],
      },
    },
  },
];

// ─── Data decay durations (hours) ───────────────────

const DECAY_HOURS: Record<string, number> = {
  // v1: grain marketing
  basis: 7 * 24,              // 7 days — changes weekly
  elevator_price: 3 * 24,     // 3 days — can change daily
  crop_condition: 14 * 24,    // 14 days — evolves slowly
  yield_estimate: 30 * 24,    // 30 days — season-long signal
  quality: 30 * 24,           // 30 days — post-harvest, stable
  // v1.5: seasonal expansion
  seeding_progress: 7 * 24,   // 7 days — changes fast during seeding
  input_price: 14 * 24,       // 14 days — less volatile than grain
  weather_observation: 3 * 24, // 3 days — weather moves fast
  harvest_progress: 7 * 24,   // 7 days — changes fast during harvest
  pest_report: 14 * 24,       // 14 days — regional persistence
  acres_planned: 30 * 24,     // 30 days — season-long plan
};

// ─── Tool Executor ──────────────────────────────────

export interface ToolExecutionContext {
  userId: string;
  fsaCode: string | null;
  threadId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  userRole: string;         // "farmer", "elevator", "processor", "observer", "seed", "fertilizer", "chemical", "equipment", "service"
  facilityName: string | null;  // operator's facility name (from profiles)
  facilityType: string | null;  // operator's facility type
  companyName: string | null;   // provider's company name (from profiles)
  providerType: string | null;  // provider's type: seed, fertilizer, chemical, equipment, service
}

/** Rich tool result — includes optional verification prompt for the iOS client */
export interface ToolResult {
  text: string;
  verificationPrompt?: {
    prompt: string;
    dataDescription: string;
    options: Array<{ label: string; icon: string; confidence: string }>;
    grain: string;
    dataType: string;
  };
}

export async function executeTool(
  call: ToolCall,
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  const supabase = createClient(ctx.supabaseUrl, ctx.serviceRoleKey);
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return { text: "Error: Invalid tool arguments." };
  }

  switch (call.function.name) {
    case "save_local_intel": {
      const result = await saveLocalIntel(supabase, ctx, args);
      // Fire push triggers for nearby farmers (non-blocking)
      fireLocalIntelTriggers(
        ctx.supabaseUrl, ctx.serviceRoleKey, ctx.userId,
        ctx.fsaCode, args.grain as string, args.data_type as string
      ).catch((e) => console.error("Push trigger error (local_intel):", e));
      return result;
    }
    case "update_farmer_memory":
      return { text: await updateFarmerMemory(supabase, ctx, args) };
    case "get_area_stance":
      return { text: await getAreaStance(supabase, ctx, args) };
    case "search_market":
      return { text: await searchMarket(supabase, args) };
    case "create_crop_plan":
      return { text: await createCropPlan(supabase, ctx, args) };
    case "post_daily_prices": {
      const result = await postDailyPrices(supabase, ctx, args);
      // Fire push triggers for farmers in target FSA codes (non-blocking)
      const prices = args.prices as Array<Record<string, unknown>> | undefined;
      const grains = [...new Set(prices?.map((p) => (p.product_name ?? p.grain) as string).filter(Boolean) ?? [])];
      const targetFsaCodes = (args.target_fsa_codes as string[] | undefined) ?? (ctx.fsaCode ? [ctx.fsaCode] : []);
      firePostedPriceTriggers(
        ctx.supabaseUrl, ctx.serviceRoleKey, ctx.userId,
        ctx.facilityName ?? ctx.companyName ?? "Unknown facility", grains, targetFsaCodes
      ).catch((e) => console.error("Push trigger error (posted_prices):", e));
      return { text: result };
    }
    case "get_area_prices":
      return { text: await getAreaPrices(supabase, ctx, args) };
    case "manage_products":
      return { text: await manageProducts(supabase, ctx, args) };
    case "get_demand_analytics":
      return { text: await getDemandAnalytics(supabase, ctx, args) };
    case "update_facility_status":
      return { text: await updateFacilityStatus(supabase, ctx, args) };
    case "save_feedback":
      return { text: await saveFeedback(supabase, ctx, args) };
    default:
      return { text: `Unknown tool: ${call.function.name}` };
  }
}

// ─── Elevator Name Normalization ─────────────────────

const ELEVATOR_CANONICAL: Record<string, string> = {
  richardson: "Richardson International",
  "richardson international": "Richardson International",
  "richardson pioneer": "Richardson International",
  cargill: "Cargill",
  viterra: "Viterra",
  glencore: "Viterra",
  "p&h": "P&H",
  "parrish & heimbecker": "P&H",
  "parrish and heimbecker": "P&H",
  parrish: "P&H",
  agp: "AGP Grain",
  "agp grain": "AGP Grain",
  alliance: "Alliance Grain Traders",
  "alliance grain": "Alliance Grain Traders",
  gnt: "G3 Canada",
  g3: "G3 Canada",
  "g3 canada": "G3 Canada",
  "louis dreyfus": "Louis Dreyfus",
  ldc: "Louis Dreyfus",
  "bunge": "Bunge",
  "adm": "ADM",
  "archer daniels midland": "ADM",
};

function normalizeElevatorName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return ELEVATOR_CANONICAL[key] ?? raw.trim();
}

// ─── Bounds Validation ──────────────────────────────

const BOUNDS: Record<string, { min: number; max: number }> = {
  basis: { min: -200, max: 50 },
  elevator_price: { min: 0, max: 50 },
  yield_estimate: { min: 0, max: 200 },
  seeding_progress: { min: 0, max: 100 },
  harvest_progress: { min: 0, max: 100 },
  acres_planned: { min: 0, max: 100000 },
  input_price: { min: 0, max: 5000 },
};

function validateBounds(dataType: string, value: number | null): string | null {
  if (value === null || value === undefined) return null;
  const bounds = BOUNDS[dataType];
  if (!bounds) return null;
  if (value < bounds.min || value > bounds.max) {
    return `Value ${value} for ${dataType} is out of expected range (${bounds.min} to ${bounds.max}).`;
  }
  return null;
}

// ─── Tool Implementations ────────────────────────────

// Data types that need verification prompts (prices, quantities — not subjective conditions)
const VERIFIABLE_DATA_TYPES = new Set([
  "basis", "elevator_price", "input_price", "yield_estimate", "acres_planned",
]);

function buildVerificationPrompt(
  dataType: string, grain: string, value: string
): ToolResult["verificationPrompt"] {
  if (!VERIFIABLE_DATA_TYPES.has(dataType)) return undefined;

  const labels: Record<string, { confirm: string; deny: string; prompt: string }> = {
    basis:           { confirm: "This is what I actually paid", deny: "I'm just kidding around", prompt: "Is that the actual basis you saw?" },
    elevator_price:  { confirm: "This is what I actually paid", deny: "I'm just kidding around", prompt: "Is that the real posted price?" },
    input_price:     { confirm: "This is what I actually paid", deny: "I'm just kidding around", prompt: "Is that what you actually paid?" },
    yield_estimate:  { confirm: "Actual weigh-up",             deny: "Rough estimate",           prompt: "Is that the actual yield or an estimate?" },
    acres_planned:   { confirm: "That's my real number",       deny: "Ballpark guess",           prompt: "Is that your actual acreage?" },
  };

  const l = labels[dataType] ?? labels.basis;

  return {
    prompt: l.prompt,
    dataDescription: `${value} for ${grain}`,
    grain,
    dataType,
    options: [
      { label: l.confirm, icon: "checkmark.circle.fill", confidence: "verified" },
      { label: l.deny,    icon: "face.smiling",          confidence: "reported" },
    ],
  };
}

async function saveLocalIntel(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  if (!ctx.fsaCode) {
    return { text: "Could not save — no postal code on file. Ask the farmer for their postal code." };
  }

  const dataType = args.data_type as string;
  const grain = args.grain as string;
  const valueNumeric = args.value_numeric != null ? Number(args.value_numeric) : null;
  const elevatorName = normalizeElevatorName(args.elevator_name as string | undefined);
  let confidence = (args.confidence as string) ?? "reported";

  // ── Bounds validation ─────────────────────────────
  const boundsError = validateBounds(dataType, valueNumeric);
  if (boundsError) {
    console.warn("save_local_intel bounds rejection:", boundsError);
    return { text: `Hmm, that number doesn't seem right — ${boundsError} Could you double-check?` };
  }

  // ── Outlier detection (>3 std dev from FSA mean) ──
  if (valueNumeric !== null) {
    const { data: stats } = await supabase.rpc("get_area_stance_modifier", {
      p_fsa_code: ctx.fsaCode,
      p_grain: grain,
    });
    // Only check outliers if we have enough data for a meaningful mean
    if (stats?.length > 0 && stats[0].report_count >= 5) {
      const { data: areaValues } = await supabase
        .from("local_market_intel")
        .select("value_numeric")
        .eq("fsa_code", ctx.fsaCode)
        .eq("grain", grain)
        .eq("data_type", dataType)
        .gt("expires_at", new Date().toISOString())
        .neq("confidence", "outlier")
        .not("value_numeric", "is", null);

      if (areaValues && areaValues.length >= 5) {
        const values = areaValues.map((r: { value_numeric: number }) => Number(r.value_numeric));
        const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        const variance = values.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 0 && Math.abs(valueNumeric - mean) > 3 * stdDev) {
          confidence = "outlier";
          console.warn(
            `save_local_intel outlier detected: ${valueNumeric} for ${grain} ${dataType} in ${ctx.fsaCode} (mean=${mean.toFixed(1)}, stddev=${stdDev.toFixed(1)})`
          );
        }
      }
    }
  }

  // ── Stale suppression (same user+grain+type+elevator within 24h → update) ──
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("local_market_intel")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("grain", grain)
    .eq("data_type", dataType)
    .gt("reported_at", twentyFourHoursAgo)
    .limit(1);

  // Match elevator_name if present (exact match after normalization)
  if (elevatorName) {
    query = query.eq("elevator_name", elevatorName);
  } else {
    query = query.is("elevator_name", null);
  }

  const { data: existing } = await query;

  const decayHours = DECAY_HOURS[dataType] ?? 7 * 24;
  const expiresAt = new Date(Date.now() + decayHours * 60 * 60 * 1000).toISOString();

  if (existing && existing.length > 0) {
    // Update existing record (stale suppression — don't create duplicates)
    const { error } = await supabase
      .from("local_market_intel")
      .update({
        value_numeric: valueNumeric,
        value_text: args.value_text ?? null,
        confidence,
        reported_at: new Date().toISOString(),
        expires_at: expiresAt,
        source_thread_id: ctx.threadId,
      })
      .eq("id", existing[0].id);

    if (error) {
      console.error("save_local_intel update error:", error);
      return { text: "Noted, but had trouble saving — I'll try again next time." };
    }

    const elevator = elevatorName ? ` near ${elevatorName}` : "";
    const valueDisplay = valueNumeric != null ? String(valueNumeric) : (args.value_text as string ?? "");
    return {
      text: `Updated — ${dataType} for ${grain}${elevator}. Fresher data helps everyone in your area.`,
      verificationPrompt: buildVerificationPrompt(dataType, grain, valueDisplay),
    };
  }

  // ── Insert new record ─────────────────────────────
  const { error } = await supabase.from("local_market_intel").insert({
    user_id: ctx.userId,
    fsa_code: ctx.fsaCode,
    grain,
    data_type: dataType,
    value_numeric: valueNumeric,
    value_text: args.value_text ?? null,
    elevator_name: elevatorName,
    confidence,
    expires_at: expiresAt,
    source_thread_id: ctx.threadId,
  });

  if (error) {
    console.error("save_local_intel error:", error);
    return { text: "Noted, but had trouble saving — I'll try again next time." };
  }

  const elevator = elevatorName ? ` near ${elevatorName}` : "";
  const outlierNote = confidence === "outlier"
    ? " (flagged as unusual — I'll keep it but won't factor it into area reads until more reports confirm)"
    : "";
  const valueDisplay = valueNumeric != null ? String(valueNumeric) : (args.value_text as string ?? "");
  return {
    text: `Noted — ${dataType} for ${grain}${elevator}.${outlierNote} This helps sharpen recommendations for your area.`,
    verificationPrompt: buildVerificationPrompt(dataType, grain, valueDisplay),
  };
}

async function updateFarmerMemory(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  const { error } = await supabase.from("farmer_memory").upsert(
    {
      user_id: ctx.userId,
      memory_key: args.memory_key,
      memory_value: args.memory_value,
      grain: args.grain ?? null,
      updated_at: new Date().toISOString(),
      source_thread_id: ctx.threadId,
    },
    { onConflict: "user_id,memory_key,grain" }
  );

  if (error) {
    console.error("update_farmer_memory error:", error);
    return "Got it — though I had a small hiccup saving. I'll remember next time.";
  }

  return "Got it — I'll remember that for next time.";
}

async function getAreaStance(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!ctx.fsaCode) {
    return "No postal area on file. National stance only available.";
  }

  const { data, error } = await supabase.rpc("get_area_stance_modifier", {
    p_fsa_code: ctx.fsaCode,
    p_grain: args.grain,
  });

  if (error || !data || data.length === 0) {
    return `No area data for ${args.grain} in ${ctx.fsaCode} yet. Using national stance only.`;
  }

  const row = data[0];
  if (row.modifier === null) {
    return `Not enough local reports for ${args.grain} in ${ctx.fsaCode} (need 3+). National stance only.`;
  }

  const direction = row.modifier > 0 ? "stronger" : row.modifier < 0 ? "weaker" : "in line with";
  return `Area ${ctx.fsaCode} is ${direction} national for ${args.grain}: modifier ${row.modifier > 0 ? "+" : ""}${row.modifier}. ${row.report_count} reports, confidence: ${row.confidence}. Basis trend: ${row.basis_trend ?? "unknown"}.`;
}

async function searchMarket(
  supabase: any,
  args: Record<string, unknown>
): Promise<string> {
  const grain = args.grain as string;
  const sources = (args.sources as string[]) ?? ["cgc"];
  const weeksBack = (args.weeks_back as number) ?? 4;
  const results: string[] = [];

  for (const source of sources) {
    switch (source) {
      case "cftc_cot": {
        const { data } = await supabase.rpc("get_cot_positioning", {
          p_grain: grain,
          p_crop_year: currentCropYear(),
          p_weeks_back: weeksBack,
        });
        if (data?.length) {
          const latest = data[0];
          results.push(
            `CFTC COT (${grain}): Managed money net ${latest.mm_net_position > 0 ? "long" : "short"} ${Math.abs(latest.mm_net_position)} contracts. Commercial net ${latest.comm_net_position > 0 ? "long" : "short"} ${Math.abs(latest.comm_net_position)}.`
          );
        }
        break;
      }
      case "usda_exports": {
        const { data } = await supabase.rpc("get_usda_export_context", {
          p_cgc_grain: grain,
          p_weeks_back: weeksBack,
        });
        if (data?.length) {
          const d = data[0];
          results.push(
            `USDA exports (${grain}): Net sales ${d.net_sales_mt}mt, shipments ${d.exports_mt}mt, outstanding ${d.outstanding_mt}mt.`
          );
        }
        break;
      }
      case "usda_wasde": {
        const { data } = await supabase.rpc("get_usda_wasde_context", {
          p_cgc_grain: grain,
          p_months_back: 2,
        });
        if (data?.length) {
          const d = data[0];
          results.push(
            `WASDE (${grain}): S/U ratio ${d.stocks_to_use_pct}%, revision: ${d.revision_direction ?? "unchanged"}.`
          );
        }
        break;
      }
      case "grain_prices": {
        const { data } = await supabase
          .from("grain_prices")
          .select("grain, price_date, close_price")
          .eq("grain", grain)
          .order("price_date", { ascending: false })
          .limit(5);
        if (data?.length) {
          const prices = data.map(
            (p: { price_date: string; close_price: number }) => `${p.price_date}: $${p.close_price}`
          );
          results.push(`Prices (${grain}): ${prices.join(", ")}`);
        }
        break;
      }
      case "cgc": {
        // Pipeline velocity: deliveries, terminal receipts, exports, stocks
        const { data } = await supabase.rpc("get_pipeline_velocity", {
          p_grain: grain,
          p_crop_year: currentCropYear(),
        });
        if (data?.length) {
          const latest = data[data.length - 1];
          const fields = [
            latest.deliveries_kt != null ? `Deliveries: ${Number(latest.deliveries_kt).toFixed(0)}kt` : null,
            latest.terminal_receipts_kt != null ? `Terminal receipts: ${Number(latest.terminal_receipts_kt).toFixed(0)}kt` : null,
            latest.exports_kt != null ? `Exports: ${Number(latest.exports_kt).toFixed(0)}kt` : null,
            latest.stocks_kt != null ? `Stocks: ${Number(latest.stocks_kt).toFixed(0)}kt` : null,
          ].filter(Boolean);
          results.push(`CGC pipeline (${grain}, week ${latest.grain_week}): ${fields.join(", ")}`);
        }
        break;
      }
      case "x_signals": {
        // Recent X/Twitter market signals for this grain
        const { data } = await supabase
          .from("x_market_signals")
          .select("content, relevance_score, searched_at, source")
          .eq("grain", grain)
          .eq("crop_year", currentCropYear())
          .order("searched_at", { ascending: false })
          .limit(5);
        if (data?.length) {
          const signals = data.map(
            (s: { content: string; relevance_score: number; source: string }) =>
              `[${s.source}, score ${s.relevance_score}] ${s.content.substring(0, 120)}`
          );
          results.push(`X signals (${grain}):\n${signals.join("\n")}`);
        }
        break;
      }
      case "usda_crop_progress": {
        const { data } = await supabase.rpc("get_usda_crop_conditions", {
          p_cgc_grain: grain,
          p_weeks_back: weeksBack,
        });
        if (data?.length) {
          const d = data[0];
          results.push(
            `Crop progress (${grain}): Good/Excellent ${d.good_excellent_pct}%, YoY change ${d.ge_pct_yoy_change > 0 ? "+" : ""}${d.ge_pct_yoy_change}pp. Condition index: ${d.condition_index}.`
          );
        }
        break;
      }
      default:
        results.push(`Source '${source}' not yet implemented in chat tools.`);
    }
  }

  return results.length > 0 ? results.join("\n") : `No data found for ${grain}.`;
}

async function createCropPlan(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  const grain = args.grain as string;
  const cropYear = (args.crop_year as string) ?? currentCropYear();

  const { error } = await supabase.from("crop_plans").upsert(
    {
      user_id: ctx.userId,
      grain,
      crop_year: cropYear,
      production_estimate_kt: args.production_estimate_kt ?? null,
      contracted_kt: args.contracted_kt ?? null,
      uncontracted_kt: args.uncontracted_kt ?? null,
    },
    { onConflict: "user_id,grain,crop_year" }
  );

  if (error) {
    console.error("create_crop_plan error:", error);
    return `Trouble saving crop plan for ${grain}. I'll try again.`;
  }

  const contracted = args.contracted_kt ? `${args.contracted_kt}kt contracted, ` : "";
  const uncontracted = args.uncontracted_kt ? `${args.uncontracted_kt}kt still open` : "amounts TBD";
  return `Crop plan updated for ${grain} ${cropYear}. ${contracted}${uncontracted}.`;
}

// ─── Unified Pricing Tools (Track 39) ────────────────

const OPERATOR_ROLES = new Set([
  "elevator", "crusher", "mill", "terminal",
  "seed", "fertilizer", "chemical",
]);

async function postDailyPrices(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!OPERATOR_ROLES.has(ctx.userRole)) {
    return "Only operators (elevator, crusher, seed company, fertilizer dealer, etc.) can post prices. If you're a farmer reporting a price you saw, I'll save it as local intel instead.";
  }

  const displayName = ctx.facilityName ?? ctx.companyName;
  if (!displayName) {
    return "I need your facility or company name to post prices. Check your profile settings.";
  }

  const prices = args.prices as Array<Record<string, unknown>>;
  if (!prices || prices.length === 0) {
    return "No prices to save. Paste your price sheet and I'll parse it.";
  }

  let targetFsaCodes = args.target_fsa_codes as string[] | undefined;
  if (!targetFsaCodes?.length) {
    if (ctx.fsaCode) {
      targetFsaCodes = [ctx.fsaCode];
    } else {
      return "I need at least one postal area (FSA) to target these prices. What areas do you serve?";
    }
  }

  if (targetFsaCodes.length > 3) {
    return "Maximum 3 target areas (FSA codes) per posting. Which 3 are most important?";
  }

  // 24-hour default expiry for all posted prices
  const DEFAULT_EXPIRY_HOURS = 24;

  const results: string[] = [];
  let savedCount = 0;

  for (const price of prices) {
    const productName = (price.product_name ?? price.grain) as string;
    if (!productName) continue;

    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("posted_prices").insert({
      operator_id: ctx.userId,
      business_type: ctx.userRole,
      facility_name: displayName,
      grain: productName,
      grade: price.grade ?? null,
      price_per_tonne: price.price_per_tonne != null ? Number(price.price_per_tonne) : null,
      price_per_bushel: price.price_per_bushel != null ? Number(price.price_per_bushel) : null,
      basis: price.basis != null ? Number(price.basis) : null,
      basis_reference: price.basis_reference ?? null,
      delivery_period: (price.delivery_period as string) ?? "spot",
      unit: (price.unit as string) ?? "tonne",
      capacity_notes: price.capacity_notes ?? null,
      delivery_notes: price.delivery_notes ?? null,
      special_offer: price.special_offer ?? null,
      posted_at: new Date().toISOString(),
      expires_at: expiresAt,
      source_method: "chat",
      target_fsa_codes: targetFsaCodes,
    });

    if (error) {
      console.error(`post_daily_prices error for ${productName}:`, error);
      results.push(`Failed to save ${productName}: ${error.message}`);
    } else {
      savedCount++;
      const basisStr = price.basis != null ? ` (basis ${Number(price.basis) > 0 ? "+" : ""}${price.basis})` : "";
      const specialStr = price.special_offer ? ` — ${price.special_offer}` : "";
      results.push(`${productName}${price.grade ? ` ${price.grade}` : ""}${basisStr}${specialStr}`);
    }
  }

  if (savedCount === 0) {
    return `Had trouble saving all ${prices.length} prices. ${results.join("; ")}`;
  }

  // Get farmer reach count
  const { data: reachData } = await supabase.rpc("get_operator_reach", {
    p_fsa_codes: targetFsaCodes,
  });
  const farmerCount = reachData?.[0]?.farmer_count ?? 0;

  // Get yesterday's query counts as a teaser
  const { data: analyticsData } = await supabase.rpc("get_operator_analytics", {
    p_days_back: 1,
  });
  let teaser = "";
  if (analyticsData?.length) {
    const top = analyticsData.slice(0, 2).map(
      (a: { grain: string; current_count: number }) => `${a.grain} was queried ${a.current_count} time${a.current_count !== 1 ? "s" : ""}`
    );
    teaser = ` Yesterday ${top.join(", ")}.`;
  }

  const areas = targetFsaCodes.join(", ");
  const reachStr = farmerCount > 0 ? ` ${farmerCount} farmers in those areas can see your prices now.` : "";
  return `Posted ${savedCount} price${savedCount > 1 ? "s" : ""} to ${areas}: ${results.join(", ")}.${reachStr}${teaser}`;
}

async function getAreaPrices(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!ctx.fsaCode) {
    return "No postal area on file — I can't look up local prices without it.";
  }

  const grain = args.grain as string | undefined;
  const businessType = args.business_type as string | undefined;

  const { data, error } = await supabase.rpc("get_area_prices", {
    p_fsa_code: ctx.fsaCode,
    p_grain: grain ?? null,
    p_business_type: businessType ?? null,
  });

  if (error) {
    console.error("get_area_prices error:", error);
    return "Had trouble pulling prices. Try again in a moment.";
  }

  if (!data || data.length === 0) {
    const grainStr = grain ? ` for ${grain}` : "";
    return `No posted prices${grainStr} in your area (${ctx.fsaCode}) right now. More will appear as operators join.`;
  }

  // Log queries to price_query_log for demand analytics
  const logEntries = data.map((p: any) => ({
    operator_id: p.operator_id,
    farmer_id: ctx.userId,
    grain: p.grain,
    fsa_code: ctx.fsaCode,
  }));
  // Deduplicate by operator_id + grain
  const seen = new Set<string>();
  const uniqueEntries = logEntries.filter((e: { operator_id: string; grain: string }) => {
    const key = `${e.operator_id}:${e.grain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (uniqueEntries.length > 0) {
    await supabase.from("price_query_log").insert(uniqueEntries);
  }

  // Format results with source tags
  const lines = data.map((p: any) => {
    const priceStr = p.price_per_tonne
      ? `$${Number(p.price_per_tonne).toFixed(2)}/t`
      : p.price_per_bushel
        ? `$${Number(p.price_per_bushel).toFixed(2)}/bu`
        : "";
    const basisStr = p.basis != null ? ` (basis ${Number(p.basis) > 0 ? "+" : ""}${Number(p.basis).toFixed(0)})` : "";
    const freshness = Number(p.hours_since_posted) < 24
      ? `${Math.round(Number(p.hours_since_posted))}h ago`
      : `${Math.round(Number(p.hours_since_posted) / 24)}d ago`;
    const capacityStr = p.capacity_notes ? `\n    ${p.capacity_notes}` : "";
    const deliveryStr = p.delivery_notes ? `${p.capacity_notes ? ". " : "\n    "}${p.delivery_notes}` : "";
    const statusStr = p.facility_status ? `\n    Status: ${p.facility_status}` : "";
    const specialStr = p.special_offer ? `\n    DEAL: ${p.special_offer}` : "";
    const sponsoredTag = p.is_sponsored ? " [sponsored]" : "";
    return `${p.facility_name} (${p.business_type}): ${p.grain}${p.grade ? ` ${p.grade}` : ""} — ${priceStr}${basisStr} [${p.delivery_period}, posted ${freshness}]${sponsoredTag} [posted pricing]${capacityStr}${deliveryStr}${statusStr}${specialStr}`;
  });

  return `Posted prices in ${ctx.fsaCode}:\n${lines.join("\n")}`;
}

async function manageProducts(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!OPERATOR_ROLES.has(ctx.userRole)) {
    return "Only operators can manage product catalogs.";
  }

  const action = args.action as string;
  const productName = args.product_name as string;
  const productCategory = args.product_category as string | undefined;

  if (action === "add") {
    const { error } = await supabase.from("operator_products").upsert(
      {
        operator_id: ctx.userId,
        product_name: productName,
        product_category: productCategory ?? null,
        is_active: true,
        added_at: new Date().toISOString(),
      },
      { onConflict: "operator_id,product_name" }
    );
    if (error) {
      console.error("manage_products add error:", error);
      return `Trouble adding ${productName}. Try again.`;
    }
    return `Added ${productName} to your product line. Want to post a price?`;
  }

  if (action === "remove") {
    const { error } = await supabase
      .from("operator_products")
      .update({ is_active: false })
      .eq("operator_id", ctx.userId)
      .eq("product_name", productName);
    if (error) {
      console.error("manage_products remove error:", error);
      return `Trouble removing ${productName}. Try again.`;
    }
    return `Removed ${productName}. Existing prices for it expire normally.`;
  }

  return `Unknown action '${action}'. Use 'add' or 'remove'.`;
}

async function getDemandAnalytics(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!OPERATOR_ROLES.has(ctx.userRole)) {
    return "Demand analytics are for operators only.";
  }

  const daysBack = (args.days_back as number) ?? 7;

  const { data, error } = await supabase.rpc("get_operator_analytics", {
    p_days_back: daysBack,
  });

  if (error) {
    console.error("get_demand_analytics error:", error);
    return "Had trouble pulling analytics. Try again in a moment.";
  }

  if (!data || data.length === 0) {
    return `No farmer queries for your prices in the last ${daysBack} days. Fresh prices attract more attention — try posting today's sheet.`;
  }

  const lines = data.map((row: { grain: string; current_count: number; previous_count: number; trend: string }, i: number) => {
    const trendArrow = row.trend === "up" ? "↑" : row.trend === "down" ? "↓" : "→";
    const trendLabel = row.trend === "up"
      ? `up from ${row.previous_count}`
      : row.trend === "down"
        ? `down from ${row.previous_count}`
        : "flat";
    return `  ${i + 1}. ${row.grain} — ${row.current_count} queries (${trendArrow} ${trendLabel})`;
  });

  return `Interest in your prices (last ${daysBack} days):\n${lines.join("\n")}`;
}

async function updateFacilityStatus(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  if (!OPERATOR_ROLES.has(ctx.userRole)) {
    return "Only operators can update facility status.";
  }

  const status = (args.status as string)?.trim();
  if (!status) {
    return "What's the status? Tell me what farmers should know about your facility.";
  }

  const truncated = status.length > 200 ? status.slice(0, 200) : status;

  const { error } = await supabase
    .from("profiles")
    .update({ facility_status: truncated })
    .eq("id", ctx.userId);

  if (error) {
    console.error("update_facility_status error:", error);
    return "Had trouble saving the status. Try again.";
  }

  return `Noted — farmers will see: "${truncated}"`;
}

// ─── Feedback Tool ────────────────────────────────────

async function saveFeedback(
  supabase: any,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<string> {
  const feedbackType = args.feedback_type as string;
  const severity = (args.severity as string) ?? "medium";

  const { error } = await supabase.from("feedback_log").insert({
    user_id: ctx.userId,
    thread_id: ctx.threadId,
    feedback_type: feedbackType,
    farmer_message: (args.farmer_message as string) ?? null,
    bushy_context: (args.bushy_context as string) ?? null,
    severity,
  });

  if (error) {
    console.error("save_feedback error:", error);
    return "I tried to flag this for bu/ac but hit a snag. I'll try again.";
  }

  switch (feedbackType) {
    case "frustration":
      return "Flagged for bu/ac — he'll see this in his morning digest.";
    case "bug_report":
      return "Bug logged — bu/ac will look into it.";
    case "feature_request":
      return "Feature request saved — bu/ac reads every one of these.";
    case "praise":
      return "Noted — always good to know what's working.";
    case "correction":
      return "Correction logged — this helps me get it right next time.";
    default:
      return "Feedback saved.";
  }
}


// ─── Helpers ─────────────────────────────────────────

function currentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  // CGC crop year starts August 1
  if (month >= 8) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}
