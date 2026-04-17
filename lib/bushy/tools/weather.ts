// WS4 Task 4.4 — Bushy chat harness
// getWeatherTool composition: ties together detect + cache + eccc + noaa
// into a single BushyTool the LLM can call.
//
// Flow per invocation:
//   1. Build cache key from postal + includeForecast flag.
//   2. readCache — if hit, return cached snapshot (1-hour TTL).
//   3. detectCountry — route to ECCC (CA) or NOAA (US); reject 'unknown'.
//   4. Client returns null for unknown location, throws on upstream error.
//   5. writeCache (best-effort) + auto-extraction (weather snapshot row).
//
// Rate limiting: 1 per turn, 4 per conversation. Weather is high-signal
// but low-urgency — no need for the LLM to fetch it repeatedly within a
// single turn.

import { z } from "zod";
import type { BushyTool } from "./types";
import { detectCountry } from "./weather/detect";
import { getCanadianWeather } from "./weather/eccc";
import { getUSWeather } from "./weather/noaa";
import { cacheKey, readCache, writeCache } from "./weather/cache";

const WeatherArgs = z.object({
  postalOrZip: z
    .string()
    .min(3, "postalOrZip must be at least 3 chars")
    .max(16, "postalOrZip too long (expected a postal code or ZIP)"),
  includeForecast: z.boolean().default(true),
});

export const getWeatherTool: BushyTool = {
  name: "get_weather",
  description:
    "Current weather + 5-day forecast for a Canadian postal code or US ZIP. " +
    "Returns temperature, conditions, wind, humidity, and per-day high/low/precip. " +
    "Uses ECCC for Canadian postal codes and NOAA for US ZIPs; automatically " +
    "routes based on the postal format. 1-hour cache — repeated calls within " +
    "an hour return the same snapshot.",
  parameters: WeatherArgs,
  source: "native",
  rateLimit: { perTurn: 1, perConversation: 4 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = WeatherArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `get_weather validation failed: ${parsed.error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    const key = cacheKey(parsed.data.postalOrZip, parsed.data.includeForecast);
    const cached = await readCache(ctx.supabase, key);
    if (cached) {
      return {
        ok: true,
        data: { ...cached, cached: true },
        latencyMs: Date.now() - start,
      };
    }

    const country = detectCountry(parsed.data.postalOrZip);
    if (country === "unknown") {
      return {
        ok: false,
        error:
          "Unrecognized postal/ZIP format. Expected a Canadian postal code (e.g. T0L 1A0) or US ZIP (e.g. 59401).",
        latencyMs: Date.now() - start,
      };
    }

    let snapshot = null;
    try {
      if (country === "CA") {
        snapshot = await getCanadianWeather(
          parsed.data.postalOrZip,
          ctx.supabase,
        );
      } else {
        snapshot = await getUSWeather(parsed.data.postalOrZip);
      }
    } catch (e) {
      return {
        ok: false,
        error: `Weather provider failed: ${e instanceof Error ? e.message : String(e)}`,
        latencyMs: Date.now() - start,
      };
    }

    if (!snapshot) {
      return {
        ok: false,
        error: `No weather data available for ${parsed.data.postalOrZip}. Coverage may be missing — pass a nearby major-city postal instead.`,
        latencyMs: Date.now() - start,
      };
    }

    // Side effect 1: cache (best-effort).
    await writeCache(
      ctx.supabase,
      key,
      parsed.data.postalOrZip,
      country,
      snapshot,
    );

    // Side effect 2: auto-extraction. chat_extractions.fsa_code is NOT
    // NULL — skip when ctx.fsaCode is absent rather than crashing.
    if (ctx.fsaCode) {
      try {
        await ctx.supabase.from("chat_extractions").insert({
          user_id: ctx.userId,
          thread_id: ctx.threadId,
          message_id: ctx.messageId,
          fsa_code: ctx.fsaCode,
          category: "weather",
          data_type: "snapshot",
          value_numeric: snapshot.agronomic?.last7DaysPrecipMm ?? null,
          value_text: `${snapshot.current.conditions}, ${snapshot.current.tempC}C at ${snapshot.location.name}`,
          confidence: "inferred",
          reasoning: `Auto-captured from get_weather tool call for ${parsed.data.postalOrZip}`,
        });
      } catch {
        // Best-effort; don't fail the read.
      }
    }

    return {
      ok: true,
      data: { ...snapshot, cached: false },
      latencyMs: Date.now() - start,
    };
  },
};

export { WeatherArgs };
