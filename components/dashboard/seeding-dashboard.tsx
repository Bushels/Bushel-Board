// components/dashboard/seeding-dashboard.tsx
// Top-level orchestrator for the /seeding page.
// Owns the two pieces of cross-cutting state (currentWeek + selectedCommodity)
// that are shared between the small-multiples cards above and the focus map
// below. The shared scrubber sits between them as the visual hand-off.

"use client";

import { useMemo, useState } from "react";
import { SeedingSmallMultiples } from "@/components/dashboard/seeding-small-multiples";
import { SeedingFocusMap } from "@/components/dashboard/seeding-focus-map";
import { SeedingScrubber } from "@/components/dashboard/seeding-scrubber";
import type { CommodityDashboard } from "@/lib/queries/seeding-progress";

interface Props {
  dashboards: CommodityDashboard[];
}

export function SeedingDashboard({ dashboards }: Props) {
  // Compute the shared week timeline once
  const allWeeks = useMemo(() => {
    const set = new Set<string>();
    for (const d of dashboards) {
      for (const r of d.rows) set.add(r.week_ending);
    }
    return [...set].sort();
  }, [dashboards]);

  const [currentWeek, setCurrentWeek] = useState<string>(
    allWeeks[allWeeks.length - 1] ?? "",
  );

  // Default to the first commodity that has data; fall back to CORN
  const initialCommodity =
    dashboards.find((d) => d.rows.length > 0)?.commodity ?? "CORN";
  const [selectedCommodity, setSelectedCommodity] =
    useState<string>(initialCommodity);

  return (
    <div className="space-y-6">
      {/* Cards row — at-a-glance comparison across all 5 crops */}
      <SeedingSmallMultiples
        dashboards={dashboards}
        currentWeek={currentWeek}
        selectedCommodity={selectedCommodity}
        onSelectCommodity={setSelectedCommodity}
      />

      {/* Shared week scrubber — drives both cards above and map below */}
      {allWeeks.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/60 px-4 pb-3 pt-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Shared week scrubber
          </p>
          <SeedingScrubber
            weeks={allWeeks}
            currentWeek={currentWeek}
            onChange={setCurrentWeek}
          />
        </div>
      )}

      {/* Focus map — drill-down for the selected commodity */}
      <SeedingFocusMap
        dashboards={dashboards}
        selectedCommodity={selectedCommodity}
        currentWeek={currentWeek}
        onSelectCommodity={setSelectedCommodity}
      />
    </div>
  );
}
