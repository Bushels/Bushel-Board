"use client";

import type { CommunityStats } from "@/lib/queries/community";

interface CommunityStatsProps {
  stats: CommunityStats;
  variant: "hero" | "footer";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

export function CommunityStatsDisplay({ stats, variant }: CommunityStatsProps) {
  if (variant === "hero") {
    return (
      <div className="text-center text-wheat-300">
        <p className="text-sm font-medium uppercase tracking-wider text-wheat-400">
          Prairie farmers are tracking
        </p>
        <p className="mt-2 text-2xl font-display font-semibold">
          <span>{formatNumber(stats.total_tonnes)}</span> tonnes across{" "}
          <span>{formatNumber(stats.total_acres)}</span> acres
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-wheat-200 dark:border-wheat-800 px-6 py-3 text-center text-xs text-muted-foreground">
      Monitoring {formatNumber(stats.total_tonnes)} tonnes across{" "}
      {formatNumber(stats.total_acres)} acres
    </div>
  );
}
