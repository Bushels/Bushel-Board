"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtKt } from "@/lib/utils/format";

interface SupplyPipelineProps {
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  exports_kt?: number;
  food_industrial_kt?: number;
  feed_waste_kt?: number;
  carry_out_kt?: number;
  grain: string;
  domesticData?: Array<{ region: string; ktonnes: number }>;
}

const DOMESTIC_COLORS: Record<string, string> = {
  "Pacific": "var(--color-province-ab)",
  "Thunder Bay": "var(--color-prairie)",
  "Churchill": "var(--color-province-sk)",
  "Eastern Terminals": "var(--color-terminal-brown)",
  "Canadian Domestic": "var(--color-province-mb)",
  "Process Elevators": "var(--color-elevator-gold)",
  "Export Destinations": "var(--color-canola)",
};

export function SupplyPipeline({
  carry_in_kt,
  production_kt,
  total_supply_kt,
  exports_kt,
  food_industrial_kt,
  feed_waste_kt,
  carry_out_kt,
  grain,
  domesticData,
}: SupplyPipelineProps) {
  const [domesticOpen, setDomesticOpen] = useState(false);

  const safeDivisor = total_supply_kt > 0 ? total_supply_kt : 1;
  const max = Math.max(total_supply_kt * 1.05, 1);

  // Disposition % of Total Supply = (exports + food/industrial) / total supply
  const dispositionKt = (exports_kt ?? 0) + (food_industrial_kt ?? 0);
  const dispositionPct = ((dispositionKt / safeDivisor) * 100).toFixed(1);

  // Total accounted disposition
  const totalDisposition = (exports_kt ?? 0) + (food_industrial_kt ?? 0) + (feed_waste_kt ?? 0) + (carry_out_kt ?? 0);
  const totalDispositionPct = ((totalDisposition / safeDivisor) * 100).toFixed(1);

  const hasDisposition = exports_kt != null || food_industrial_kt != null || feed_waste_kt != null || carry_out_kt != null;

  // Filter and sort domestic data
  const filteredDomestic = (domesticData ?? [])
    .filter((d) => d.ktonnes > 0)
    .sort((a, b) => b.ktonnes - a.ktonnes);
  const hasDomestic = filteredDomestic.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-display text-base font-semibold">
          {grain} Supply Pipeline
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          AAFC balance sheet: {fmtKt(production_kt)} production, {fmtKt(carry_in_kt)} carry-in, {fmtKt(total_supply_kt)} total supply
        </p>
      </div>

      {/* Supply side */}
      <div className="space-y-2.5">
        <WaterfallRow label="Carry-in" value={carry_in_kt} max={max} color="var(--color-canola)" />
        <WaterfallRow label="Production" value={production_kt} max={max} color="var(--color-prairie)" />

        <div className="border-t border-dashed border-canola/25 my-1" />

        <WaterfallRow label="= Total Supply" value={total_supply_kt} max={max} color="var(--color-canola)" bold />

        {/* Disposition side */}
        {hasDisposition && (
          <>
            <div className="border-t border-dashed border-border my-1" />

            {exports_kt != null && (
              <WaterfallRow label="Exports" value={exports_kt} max={max} color="var(--color-province-ab)" />
            )}
            {food_industrial_kt != null && (
              <WaterfallRow label="Food / Industrial" value={food_industrial_kt} max={max} color="var(--color-prairie)" />
            )}
            {feed_waste_kt != null && (
              <WaterfallRow label="Feed / Waste / Loss" value={feed_waste_kt} max={max} color="var(--color-error)" />
            )}
            {carry_out_kt != null && (
              <WaterfallRow label="Carry-out" value={carry_out_kt} max={max} color="var(--color-canola)" />
            )}
          </>
        )}
      </div>

      {/* Summary callouts */}
      {hasDisposition && (
        <div className="flex flex-wrap gap-3 pt-2">
          <Callout
            value={`${dispositionPct}%`}
            label="disposition (exports + food/ind.)"
            color="text-[var(--color-province-ab)] border-[var(--color-province-ab)]/20 bg-[var(--color-province-ab)]/5"
          />
          <Callout
            value={`${totalDispositionPct}%`}
            label="total accounted use"
            color="text-[var(--color-prairie)] border-[var(--color-prairie)]/20 bg-[var(--color-prairie)]/5"
          />
        </div>
      )}

      {/* Domestic Use Breakdown (collapsible) */}
      {hasDomestic && (
        <div>
          <div className="border-t border-dashed border-border my-1" />
          <button
            type="button"
            onClick={() => setDomesticOpen((prev) => !prev)}
            className="flex items-center gap-1.5 w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Domestic Use Breakdown
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${domesticOpen ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ${domesticOpen ? "max-h-[500px]" : "max-h-0"}`}
          >
            <div className="space-y-2.5 pb-2">
              {filteredDomestic.map((d, i) => (
                <WaterfallRow
                  key={`${d.region}-${i}`}
                  label={d.region}
                  value={d.ktonnes}
                  max={max}
                  color={DOMESTIC_COLORS[d.region] ?? "var(--color-muted-foreground)"}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WaterfallRow({
  label, value, max, color, bold,
}: {
  label: string; value: number; max: number; color: string; bold?: boolean;
}) {
  const widthPct = (value / max) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className={`w-24 sm:w-36 text-right text-xs shrink-0 ${bold ? "font-semibold text-canola" : "text-muted-foreground"}`}>
        {label}
      </span>
      <div className="flex-1 h-7 relative rounded bg-muted/30">
        <div
          className={`absolute top-0 h-full rounded transition-all duration-1000 ${bold ? "border border-canola" : ""}`}
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
      <span className={`min-w-[70px] text-xs font-semibold ${bold ? "text-canola text-sm" : "text-foreground"}`}>
        {fmtKt(value)}
      </span>
    </div>
  );
}

function Callout({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className={`px-3 py-2 rounded-lg border ${color}`}>
      <p className="font-display text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[0.6rem] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
