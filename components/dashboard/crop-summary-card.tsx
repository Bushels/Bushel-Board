"use client";

import Link from "next/link";
import { Lock, TrendingUp, TrendingDown } from "lucide-react";
import { fmtKt, fmtPct } from "@/lib/utils/format";
import { GlassCard } from "@/components/ui/glass-card";

interface CropSummaryCardProps {
  grain: string;
  slug: string;
  startingStock: number;
  cyDeliveries: number;
  cwDeliveries: number;
  wowChange: number;
  isUnlocked: boolean;
  index: number;
}

export function CropSummaryCard({
  grain,
  slug,
  startingStock,
  cyDeliveries,
  cwDeliveries,
  wowChange,
  isUnlocked,
  index,
}: CropSummaryCardProps) {
  const deliveredPct = startingStock > 0 ? (cyDeliveries / startingStock) * 100 : 0;
  const isPositive = wowChange >= 0;

  return (
    <GlassCard index={index}>
      <Link
        href={isUnlocked ? `/grain/${slug}` : "/my-farm"}
        className={`group relative flex flex-col gap-3 p-4 ${
          !isUnlocked ? "opacity-60" : ""
        }`}
      >
        {!isUnlocked && (
          <Lock className="absolute top-3 right-3 h-4 w-4 text-muted-foreground" />
        )}

        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm">{grain}</h3>
          <span
            className={`flex items-center gap-0.5 text-xs font-mono ${
              isPositive ? "text-prairie" : "text-error"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {fmtPct(wowChange)}
          </span>
        </div>

        <div className="text-xs text-muted-foreground">
          Starting: {fmtKt(startingStock)}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-canola to-canola/70 transition-all duration-1000"
            style={{ width: `${Math.min(deliveredPct, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {deliveredPct.toFixed(1)}% delivered
          </span>
          <span className="font-mono font-semibold">
            +{fmtKt(cwDeliveries)} this week
          </span>
        </div>
      </Link>
    </GlassCard>
  );
}
