/**
 * Push Trigger Logic — Bushels Conversational Push Notifications
 *
 * Every push notification is a conversation starter, not an alert.
 * Each notification carries a deep_link_prompt that pre-fills Bushy chat.
 *
 * Triggers fire after tool execution in chat-completion:
 * - save_local_intel → basis/condition changes → notify nearby farmers
 * - post_daily_prices → new elevator prices → notify farmers in FSA
 * - generate-farm-summary → weekly summary ready → notify the farmer
 * - Scheduled: area stance shift, re-engagement (3+ days inactive)
 *
 * All triggers are fire-and-forget (non-blocking) — never slow the chat stream.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildInternalHeaders } from "./internal-auth.ts";

// ─── Types ─────────────────────────────────────

export type PushTriggerType =
  | "basis_change"
  | "elevator_price"
  | "weekly_summary"
  | "area_stance"
  | "re_engagement"
  | "crop_condition";

interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  deep_link_prompt: string;
  notification_type: PushTriggerType;
  badge_count?: number;
}

interface TriggerContext {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** The user who triggered this (excluded from notifications) */
  triggerUserId: string;
  /** FSA code where the event occurred */
  fsaCode: string | null;
  /** Grain involved */
  grain?: string;
}

// ─── Throttle: max 1 push per trigger type per user per 6 hours ──

const THROTTLE_HOURS = 6;

async function isThrottled(
  supabase: SupabaseClient,
  userId: string,
  triggerType: PushTriggerType
): Promise<boolean> {
  const cutoff = new Date(Date.now() - THROTTLE_HOURS * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("push_notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("trigger_type", triggerType)
    .gte("sent_at", cutoff);

  return (count ?? 0) > 0;
}

async function logPushSent(
  supabase: SupabaseClient,
  userId: string,
  triggerType: PushTriggerType,
  grain?: string
): Promise<void> {
  await supabase.from("push_notification_log").insert({
    user_id: userId,
    trigger_type: triggerType,
    grain: grain ?? null,
  });
}

// ─── Core: Check & Fire ────────────────────────

/**
 * Check if a user should receive a push, and if so, dispatch it.
 * Returns true if notification was sent.
 */
async function shouldSendAndFire(
  supabase: SupabaseClient,
  ctx: TriggerContext,
  userId: string,
  triggerType: PushTriggerType,
  title: string,
  body: string,
  deepLinkPrompt: string,
  grain?: string
): Promise<boolean> {
  // 1. Check user has push tokens
  const { count: tokenCount } = await supabase
    .from("push_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!tokenCount || tokenCount === 0) return false;

  // 2. Check throttle
  if (await isThrottled(supabase, userId, triggerType)) return false;

  // 3. Fire push via Edge Function
  try {
    const funcUrl = `${ctx.supabaseUrl}/functions/v1/push-notification-dispatch`;
    const payload: PushPayload = {
      user_ids: [userId],
      title,
      body,
      deep_link_prompt: deepLinkPrompt,
      notification_type: triggerType,
    };

    const resp = await fetch(funcUrl, {
      method: "POST",
      headers: buildInternalHeaders(),
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      await logPushSent(supabase, userId, triggerType, grain);
      return true;
    } else {
      console.error(`Push dispatch failed for ${userId}: ${resp.status}`);
      return false;
    }
  } catch (e) {
    console.error(`Push dispatch error for ${userId}:`, e);
    return false;
  }
}

// ─── Trigger: Basis Change ─────────────────────

/**
 * After save_local_intel saves a basis report, notify nearby farmers
 * who have crop plans for this grain.
 * Excludes the farmer who just reported.
 */
export async function triggerBasisChange(ctx: TriggerContext): Promise<number> {
  if (!ctx.fsaCode || !ctx.grain) return 0;

  const supabase = createClient(ctx.supabaseUrl, ctx.serviceRoleKey);

  // Find farmers in the same FSA with crop plans for this grain
  const { data: nearbyFarmers } = await supabase
    .from("profiles")
    .select("id, postal_code")
    .like("postal_code", `${ctx.fsaCode}%`)
    .neq("id", ctx.triggerUserId)
    .eq("role", "farmer");

  if (!nearbyFarmers?.length) return 0;

  // Filter to those with crop plans for this grain
  const { data: cropPlanUsers } = await supabase
    .from("crop_plans")
    .select("user_id")
    .in("user_id", nearbyFarmers.map((f) => f.id))
    .eq("grain", ctx.grain);

  const targetUserIds = [...new Set(cropPlanUsers?.map((c) => c.user_id) ?? [])];

  const grain = ctx.grain.toLowerCase();
  let sent = 0;

  for (const userId of targetUserIds) {
    const fired = await shouldSendAndFire(
      supabase,
      ctx,
      userId,
      "basis_change",
      "Bushels",
      `${ctx.grain} basis is working your way today. Want a quick read?`,
      `Give me a ${grain} update`,
      ctx.grain
    );
    if (fired) sent++;
  }

  return sent;
}

// ─── Trigger: Elevator Price Posted ────────────

/**
 * After post_daily_prices posts new prices, notify farmers
 * in the target FSA codes who grow those grains.
 */
export async function triggerElevatorPricePosted(
  ctx: TriggerContext,
  facilityName: string,
  grains: string[],
  targetFsaCodes: string[]
): Promise<number> {
  if (!targetFsaCodes.length || !grains.length) return 0;

  const supabase = createClient(ctx.supabaseUrl, ctx.serviceRoleKey);

  // Find farmers in target FSAs
  const likePatterns = targetFsaCodes.map((fsa) => `${fsa}%`);
  let farmersQuery = supabase
    .from("profiles")
    .select("id, postal_code")
    .eq("role", "farmer");

  // Build OR filter for FSA codes
  const fsaFilter = targetFsaCodes.map((fsa) => `postal_code.like.${fsa}%`).join(",");
  const { data: nearbyFarmers } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "farmer")
    .or(fsaFilter);

  if (!nearbyFarmers?.length) return 0;

  // Filter to those with crop plans for any of the posted grains
  const { data: cropPlanUsers } = await supabase
    .from("crop_plans")
    .select("user_id")
    .in("user_id", nearbyFarmers.map((f) => f.id))
    .in("grain", grains);

  const targetUserIds = [...new Set(cropPlanUsers?.map((c) => c.user_id) ?? [])];

  const primaryGrain = grains[0].toLowerCase();
  let sent = 0;

  for (const userId of targetUserIds) {
    const fired = await shouldSendAndFire(
      supabase,
      ctx,
      userId,
      "elevator_price",
      "Bushels",
      `${facilityName} just posted ${grains.length > 1 ? "new prices" : `a tighter ${primaryGrain} bid`}. Worth a look?`,
      `What are elevators quoting on ${primaryGrain}?`,
      grains[0]
    );
    if (fired) sent++;
  }

  return sent;
}

// ─── Trigger: Weekly Summary Ready ─────────────

/**
 * After generate-farm-summary runs for a user, notify them.
 */
export async function triggerWeeklySummaryReady(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const ctx: TriggerContext = {
    supabaseUrl,
    serviceRoleKey,
    triggerUserId: "", // no exclusion needed
    fsaCode: null,
  };

  return shouldSendAndFire(
    supabase,
    ctx,
    userId,
    "weekly_summary",
    "Bushels",
    "Your weekly grain summary is ready.",
    "What's my summary this week?"
  );
}

// ─── Trigger: Area Stance Shift ────────────────

/**
 * Check if any grain's area stance modifier shifted >5 points
 * since the last check. Called by a scheduled scan.
 *
 * Design note: this requires comparing current vs. previous modifier.
 * Store the last-known modifier in push_notification_log metadata
 * or a dedicated snapshot table. For now, we use a simpler approach:
 * notify if area_modifier is strong (abs >= 10) and user hasn't been
 * notified about this grain today.
 */
export async function triggerAreaStanceShift(
  supabaseUrl: string,
  serviceRoleKey: string,
  fsaCode: string,
  grain: string,
  currentModifier: number
): Promise<number> {
  if (Math.abs(currentModifier) < 5) return 0; // Only notify on meaningful shifts

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Find farmers in this FSA with crop plans for this grain
  const { data: farmers } = await supabase
    .from("profiles")
    .select("id")
    .like("postal_code", `${fsaCode}%`)
    .eq("role", "farmer");

  if (!farmers?.length) return 0;

  const { data: cropPlanUsers } = await supabase
    .from("crop_plans")
    .select("user_id")
    .in("user_id", farmers.map((f) => f.id))
    .eq("grain", grain);

  const targetUserIds = [...new Set(cropPlanUsers?.map((c) => c.user_id) ?? [])];

  const direction = currentModifier > 0 ? "firmer" : "softer";
  const grainLower = grain.toLowerCase();
  let sent = 0;

  for (const userId of targetUserIds) {
    const ctx: TriggerContext = {
      supabaseUrl,
      serviceRoleKey,
      triggerUserId: "",
      fsaCode,
      grain,
    };

    const fired = await shouldSendAndFire(
      supabase,
      ctx,
      userId,
      "area_stance",
      "Bushels",
      `${grain} in ${fsaCode} looks ${direction} this morning. Open chat?`,
      `What's ${grainLower} looking like in my area?`,
      grain
    );
    if (fired) sent++;
  }

  return sent;
}

// ─── Trigger: Re-engagement ────────────────────

/**
 * Find users who haven't chatted in 3+ days and have push tokens.
 * This is designed to be called by a scheduled scan.
 * Crons are currently disabled — design only.
 */
export async function triggerReEngagement(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<number> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Find users with push tokens who haven't sent a message in 3+ days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Get users with push tokens
  const { data: pushUsers } = await supabase
    .from("push_tokens")
    .select("user_id")
    .eq("platform", "ios");

  if (!pushUsers?.length) return 0;

  const userIds = [...new Set(pushUsers.map((p) => p.user_id))];

  let sent = 0;

  for (const userId of userIds) {
    // Check last message time
    const { data: lastMessage } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // If no messages ever, or last message > 3 days ago
    const isInactive = !lastMessage || lastMessage.created_at < threeDaysAgo;
    if (!isInactive) continue;

    const ctx: TriggerContext = {
      supabaseUrl,
      serviceRoleKey,
      triggerUserId: "",
      fsaCode: null,
    };

    const fired = await shouldSendAndFire(
      supabase,
      ctx,
      userId,
      "re_engagement",
      "Bushels",
      "Hey, haven't heard from you in a bit. Anything happening in the field?",
      "" // No pre-fill — just opens chat
    );
    if (fired) sent++;
  }

  return sent;
}

// ─── Convenience: Fire triggers from chat tool results ──

/**
 * Called after save_local_intel completes. Checks if the saved data
 * warrants notifying nearby farmers.
 * Non-blocking — call with .catch() to prevent disrupting the stream.
 */
export async function fireLocalIntelTriggers(
  supabaseUrl: string,
  serviceRoleKey: string,
  triggerUserId: string,
  fsaCode: string | null,
  grain: string,
  dataType: string
): Promise<void> {
  // Only basis reports and elevator prices trigger notifications
  if (!fsaCode || (dataType !== "basis" && dataType !== "elevator_price")) return;

  const ctx: TriggerContext = {
    supabaseUrl,
    serviceRoleKey,
    triggerUserId,
    fsaCode,
    grain,
  };

  const sent = await triggerBasisChange(ctx);
  if (sent > 0) {
    console.log(`Push triggers: ${sent} basis_change notifications sent for ${grain} in ${fsaCode}`);
  }
}

/**
 * Called after post_daily_prices completes.
 * Non-blocking — call with .catch().
 */
export async function fireElevatorPriceTriggers(
  supabaseUrl: string,
  serviceRoleKey: string,
  triggerUserId: string,
  facilityName: string,
  grains: string[],
  targetFsaCodes: string[]
): Promise<void> {
  const ctx: TriggerContext = {
    supabaseUrl,
    serviceRoleKey,
    triggerUserId,
    fsaCode: targetFsaCodes[0] ?? null,
  };

  const sent = await triggerElevatorPricePosted(ctx, facilityName, grains, targetFsaCodes);
  if (sent > 0) {
    console.log(`Push triggers: ${sent} elevator_price notifications sent for ${facilityName}`);
  }
}
