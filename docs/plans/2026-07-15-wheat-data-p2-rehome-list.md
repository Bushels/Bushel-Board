# Charts kept for Wheat Data P2 re-home (do not delete yet)

These modules had no live imports after the multi-grain overview retirement, but they are useful patterns for `/data` Wheat panels.

| Module | Intended Wheat Data use |
|--------|-------------------------|
| `cot-positioning-card.tsx` | SRW/HRW/HRS positioning strip |
| `farmer-cot-card.tsx` | Farmer-readable COT copy |
| `terminal-flow-chart.tsx` | CGC terminal receipts vs exports |
| `delivery-gap-chart.tsx` | YoY delivery pace |
| `delivery-breakdown-chart.tsx` | Delivery composition |
| `logistics-card.tsx` / `logistics-banner.tsx` | Logistics pressure |
| `supply-sankey.tsx` | Supply pipeline story |
| `crush-utilization-gauge.tsx` | Process/domestic context (if Wheat-relevant) |
| `province-map.tsx` | Map pattern (GEE already uses crop-stress-map) |
| `unified-market-stance-chart.tsx` | Stance visual primitives |
| `grain-quality-donut.tsx` | Quality distribution if admitted |
| `lib/us-market-context.ts` | US context helpers |
| `lib/queries/processor-capacity.ts` | Capacity context |

Recover deleted orphans from git history only if a panel needs an exact prior implementation.
