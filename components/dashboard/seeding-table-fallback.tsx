// components/dashboard/seeding-table-fallback.tsx
// Server component. Screen-reader-equivalent of the seismograph map.
// Also rendered to all users when prefers-reduced-motion is set
// (the map's animated scrubber is the motion that's reduced).

import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";
import { groupByState } from "@/lib/queries/seeding-progress-utils";

interface Props {
  rows: SeismographRow[];
  commodity: string;
  weekEnding: string;
}

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}%`;
}

export function SeedingTableFallback({ rows, commodity, weekEnding }: Props) {
  const grouped = groupByState(rows);
  const latestPerState = Object.values(grouped)
    .map((stateRows) => stateRows[stateRows.length - 1])
    .sort((a, b) => a.state_code.localeCompare(b.state_code));

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/40">
      <table
        className="w-full text-sm"
        aria-label={`${commodity} seeding progress by state, week ending ${weekEnding}`}
      >
        <thead className="bg-muted/30 text-left">
          <tr>
            <th className="px-4 py-2 font-semibold">State</th>
            <th className="px-4 py-2 font-semibold">Planted</th>
            <th className="px-4 py-2 font-semibold">Emerged</th>
            <th className="px-4 py-2 font-semibold">Harvested</th>
            <th className="px-4 py-2 font-semibold">Pace vs 5-yr avg</th>
            <th className="px-4 py-2 font-semibold">Good/Excellent</th>
            <th className="px-4 py-2 font-semibold">YoY change</th>
          </tr>
        </thead>
        <tbody>
          {latestPerState.map((r) => (
            <tr key={r.state_code} className="border-t border-border/20">
              <td className="px-4 py-2 font-medium">
                {r.state_code}{" "}
                <span className="text-muted-foreground">{r.state_name}</span>
              </td>
              <td className="px-4 py-2">{fmtPct(r.planted_pct)}</td>
              <td className="px-4 py-2">{fmtPct(r.emerged_pct)}</td>
              <td className="px-4 py-2">{fmtPct(r.harvested_pct)}</td>
              <td className="px-4 py-2">
                {r.planted_pct_vs_avg === null
                  ? "—"
                  : `${r.planted_pct_vs_avg > 0 ? "+" : ""}${Math.round(
                      r.planted_pct_vs_avg
                    )} pts`}
              </td>
              <td className="px-4 py-2">{fmtPct(r.good_excellent_pct)}</td>
              <td className="px-4 py-2">
                {r.ge_pct_yoy_change === null
                  ? "—"
                  : `${r.ge_pct_yoy_change > 0 ? "+" : ""}${Math.round(
                      r.ge_pct_yoy_change
                    )} pts`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
