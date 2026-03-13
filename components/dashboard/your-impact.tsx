"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

const VARIANT_MESSAGES: Record<string, string> = {
  sentiment: "Your vote shapes the weekly sentiment for all farmers",
  signal: "Your ratings improve signal quality for the community",
  farm: "Your delivery data powers personalized AI insights",
  summary: "Tracking your crops contributes to anonymized benchmarks",
};

interface YourImpactProps {
  /** Use a named variant or pass a custom message */
  variant?: keyof typeof VARIANT_MESSAGES;
  message?: string;
  icon?: ReactNode;
}

/**
 * Small inline banner showing how user input improves the platform.
 * Placed below engagement features (sentiment poll, X signal feed, farm summary).
 */
export function YourImpact({ variant, message, icon }: YourImpactProps) {
  const text = message ?? (variant ? VARIANT_MESSAGES[variant] : "");
  if (!text) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-canola/5 border border-canola/10 px-3 py-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300">
      <span className="flex-shrink-0 text-canola">
        {icon ?? <Sparkles className="h-3.5 w-3.5" />}
      </span>
      <span>{text}</span>
    </div>
  );
}
