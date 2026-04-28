// components/dashboard/seeding-legend.tsx
export function SeedingLegend() {
  return (
    <aside
      className="space-y-3 rounded-2xl border border-border/40 bg-card/80 p-4 text-sm backdrop-blur"
      aria-label="Map legend"
    >
      <h3 className="font-display text-base font-semibold">Legend</h3>
      <p className="text-xs text-muted-foreground">
        Each marker is a state-level weekly crop pulse. The vertical line marks
        the selected week.
      </p>
      <LegendRow swatch="#c17f24" label="Planted" />
      <LegendRow swatch="#e8b96b" label="Emerged" />
      <LegendRow swatch="#7ba84e" label="Harvested" />
      <div className="flex items-center gap-2 text-xs">
        <svg width={28} height={14} viewBox="0 0 28 14" aria-hidden="true">
          <path
            d="M3 11 C10 5 18 9 25 3"
            fill="none"
            stroke="#437a22"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
        <span>Condition improving</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <svg width={28} height={14} viewBox="0 0 28 14" aria-hidden="true">
          <path
            d="M3 4 C10 9 18 6 25 11"
            fill="none"
            stroke="#d97706"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
        <span>Condition slipping</span>
      </div>
      <p className="border-t border-border/40 pt-3 text-xs text-muted-foreground">
        Source: USDA NASS Crop Progress. Grain belt states only.
      </p>
    </aside>
  );
}

function LegendRow({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="h-2.5 w-6 rounded"
        style={{ background: swatch }}
      />
      <span>{label}</span>
    </div>
  );
}
