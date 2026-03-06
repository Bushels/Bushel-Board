/**
 * Supabase Edge Function: generate-intelligence
 *
 * After weekly CGC data import, generates AI market intelligence for each grain.
 * Calls Claude Sonnet API per grain, stores results in grain_intelligence table.
 *
 * Triggered by import-cgc-weekly on success, or manually via POST.
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, generates for all 16 Canadian grains.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIntelligencePrompt, type GrainContext } from "./prompt-template.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const targetGrains: string[] | undefined = body.grains;

    console.log(`Generating intelligence for week ${grainWeek}, crop year ${cropYear}`);

    // Get the list of Canadian grains
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const grainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);

    // Get YoY comparison data for all grains
    const { data: yoyData } = await supabase
      .from("v_grain_yoy_comparison")
      .select("*");

    // Get supply pipeline data
    const { data: supplyData } = await supabase
      .from("v_supply_pipeline")
      .select("*");

    const yoyByGrain = new Map((yoyData ?? []).map((r: any) => [r.grain, r]));
    const supplyByGrain = new Map((supplyData ?? []).map((r: any) => [r.grain_name, r]));

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName);
        const supply = supplyByGrain.get(grainName);

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        const ctx: GrainContext = {
          grain: grainName,
          crop_year: cropYear,
          grain_week: grainWeek,
          cy_deliveries_kt: yoy.cy_deliveries_kt ?? 0,
          cw_deliveries_kt: yoy.cw_deliveries_kt ?? 0,
          wow_deliveries_pct: yoy.wow_deliveries_pct,
          cy_exports_kt: yoy.cy_exports_kt ?? 0,
          cy_crush_kt: yoy.cy_crush_kt ?? 0,
          commercial_stocks_kt: yoy.commercial_stocks_kt ?? 0,
          wow_stocks_change_kt: yoy.wow_stocks_change_kt ?? 0,
          py_deliveries_kt: yoy.py_deliveries_kt ?? 0,
          yoy_deliveries_pct: yoy.yoy_deliveries_pct,
          py_exports_kt: yoy.py_exports_kt ?? 0,
          yoy_exports_pct: yoy.yoy_exports_pct,
          py_crush_kt: yoy.py_crush_kt ?? 0,
          yoy_crush_pct: yoy.yoy_crush_pct,
          total_supply_kt: supply?.total_supply_kt ?? null,
          production_kt: supply?.production_kt ?? null,
          carry_in_kt: supply?.carry_in_kt ?? null,
          projected_exports_kt: supply?.projected_exports_kt ?? null,
          projected_crush_kt: supply?.projected_crush_kt ?? null,
          projected_carry_out_kt: supply?.projected_carry_out_kt ?? null,
        };

        const prompt = buildIntelligencePrompt(ctx);

        // Call Claude Sonnet API
        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          results.push({ grain: grainName, status: "failed", error: `Claude API ${response.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        const aiResponse = await response.json();
        const content = aiResponse.content?.[0]?.text ?? "";

        // Parse the JSON response from Claude
        let intelligence;
        try {
          intelligence = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: "Failed to parse Claude response as JSON" });
          continue;
        }

        // Upsert into grain_intelligence
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
            model_used: "claude-3-haiku-20240307",
          }, {
            onConflict: "grain,crop_year,grain_week",
          });

        if (upsertError) {
          results.push({ grain: grainName, status: "failed", error: upsertError.message });
        } else {
          results.push({ grain: grainName, status: "success" });
        }
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = results.filter(r => r.status === "skipped").length;

    console.log(`Intelligence generation complete: ${succeeded} ok, ${failed} failed, ${skipped} skipped (${duration}ms)`);

    return new Response(
      JSON.stringify({ results, duration_ms: duration, succeeded, failed, skipped }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-intelligence error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// --- Helpers (same as import-cgc-weekly) ---

function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
}
