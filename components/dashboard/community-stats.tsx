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
          Prairie farmers have already mapped
        </p>
        <p className="mt-2 text-3xl font-display font-semibold sm:text-4xl">
          <span>{formatNumber(stats.total_acres)}</span> acres
        </p>
        <p className="mt-2 text-sm text-wheat-400">
          with {formatNumber(stats.total_tonnes)} tonnes privately tracked this
          crop year
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-wheat-200 dark:border-wheat-800 px-6 py-3 text-center text-xs text-muted-foreground">
      Monitoring {formatNumber(stats.total_acres)} acres on Bushel Board this
      crop year
    </div>
  );
}
