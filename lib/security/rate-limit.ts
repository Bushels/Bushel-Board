import type { SupabaseClient } from "@supabase/supabase-js";

interface ConsumeRateLimitRow {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export interface RateLimitConfig {
  actionKey: string;
  limit: number;
  windowSeconds: number;
  errorMessage: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  error?: string;
}

function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function consumeRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig
): Promise<RateLimitDecision> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_action_key: config.actionKey,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
  });

  if (error) {
    console.error(`consume_rate_limit failed for ${config.actionKey}:`, error.message);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
      error:
        "Rate-limit protection is temporarily unavailable. Please try again in about a minute.",
    };
  }

  const row = Array.isArray(data) ? (data[0] as ConsumeRateLimitRow | undefined) : undefined;
  if (!row) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
      error:
        "Rate-limit protection is temporarily unavailable. Please try again in about a minute.",
    };
  }

  if (!row.allowed) {
    const retryAfterSeconds = Math.max(Number(row.retry_after_seconds) || 0, 1);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      error: `${config.errorMessage} Try again in ${formatRetryAfter(retryAfterSeconds)}.`,
    };
  }

  return {
    allowed: true,
    remaining: Number(row.remaining) || 0,
    retryAfterSeconds: 0,
  };
}
