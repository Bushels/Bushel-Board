"use client";

import { useState } from "react";
import { WaterfallChart } from "@/components/dashboard/waterfall-chart";
import { PaceChart } from "@/components/dashboard/pace-chart";
import { StorageBreakdown } from "@/components/dashboard/storage-breakdown";
import type { SupplyDisposition } from "@/lib/queries/supply-disposition";
import type { CumulativeWeekRow, StorageBreakdown as StorageData } from "@/lib/queries/observations";

interface OverviewChartsProps {
  supplyData: Record<string, SupplyDisposition>;
  weeklyData: Record<string, CumulativeWeekRow[]>;
  storageData: Record<string, StorageData[]>;
  grainNames: Record<string, string>; // slug -> display name
  defaultGrains: string[]; // slugs
}

export function OverviewCharts({
  supplyData,
  weeklyData,
  storageData,
  grainNames,
  defaultGrains,
}: OverviewChartsProps) {
  const [selectedGrain, setSelectedGrain] = useState(defaultGrains[0]);
  const supply = supplyData[selectedGrain];
  const weekly = weeklyData[selectedGrain] ?? [];
  const storage = storageData[selectedGrain] ?? [];
  const displayName = grainNames[selectedGrain] ?? selectedGrain;

  return (
    <div className="space-y-6">
      {/* Grain selector tabs */}
      <div className="flex gap-1 border-b">
        {defaultGrains.map((slug) => (
          <button
            key={slug}
            onClick={() => setSelectedGrain(slug)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              selectedGrain === slug
                ? "border-canola text-canola"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {grainNames[slug] ?? slug}
          </button>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Waterfall — spans 2 cols */}
        <div className="lg:col-span-2 rounded-xl border bg-card/40 backdrop-blur-sm p-4">
          {supply ? (
            <WaterfallChart data={supply} grainName={displayName} />
          ) : (
            <p className="text-sm text-muted-foreground">No supply data available</p>
          )}
        </div>

        {/* Storage breakdown — right column */}
        <div className="rounded-xl border bg-card/40 backdrop-blur-sm p-4">
          <StorageBreakdown data={storage} grainName={displayName} />
        </div>
      </div>

      {/* Pace chart — full width */}
      <div className="rounded-xl border bg-card/40 backdrop-blur-sm p-4">
        <PaceChart weeklyData={weekly} grainName={displayName} />
      </div>
    </div>
  );
}
