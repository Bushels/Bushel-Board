# Overview Bull/Bear Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Overview page's CGC snapshot + Logistics + Community Pulse sections with a single unified AI Market Stance card that groups Canadian and US stances and exposes per-row expandable bull/bear bullet commentary.

**Architecture:** Two server queries (`getMarketStances` extended for CA; new `getUsMarketStancesForOverview` for US) each return `GrainStanceData[]` with new `bullPoints`/`bearPoints` arrays normalized from `market_analysis.{bull,bear}_reasoning` (CA) and filtered `us_market_analysis.key_signals` (US). A new client component `UnifiedMarketStanceChart` renders both groups as accordion rows with a two-column bull/bear body. `overview/page.tsx` shrinks from ~170 lines to ~35.

**Tech Stack:** Next.js 16 App Router (server components), Supabase SSR, React 19, Framer Motion, Tailwind + shadcn/ui, Vitest for unit tests.

**Design doc:** `docs/plans/2026-04-16-overview-bullbear-unification-design.md` (commit `86a8ff3`)

---

## Task 1: Extend shared types for bullet points + region

**Files:**
- Modify: `components/dashboard/market-stance-chart.tsx` (top of file, exported types only — no behavior change yet)

**Step 1: Add `BulletPoint` type and extend `GrainStanceData`**

Open `components/dashboard/market-stance-chart.tsx`. Replace the existing `GrainStanceData` interface with:

```tsx
export interface BulletPoint {
  fact: string;
  reasoning: string;
}

export interface GrainStanceData {
  grain: string;
  slug: string;
  region: "CA" | "US";
  score: number; // -100 to +100
  priorScore: number | null;
  confidence: "high" | "medium" | "low";
  cashPrice?: string | null;
  priceChange?: string | null;
  thesisSummary?: string | null;
  bullPoints: BulletPoint[];
  bearPoints: BulletPoint[];
  recommendation?: string | null;
  detailHref: string;
}
```

**Step 2: Typecheck passes at this point (fields are optional-safe for existing callers)**

Run: `npx tsc --noEmit`
Expected: Fails at `lib/queries/market-stance.ts` because it doesn't yet populate the new required fields (`region`, `bullPoints`, `bearPoints`, `detailHref`). That's the next task.

**Step 3: Commit**

```bash
git add components/dashboard/market-stance-chart.tsx
git commit -m "feat(types): add BulletPoint + region/bullPoints/bearPoints/detailHref to GrainStanceData"
```

---

## Task 2: Unit test for US `key_signals` normalizer (red)

**Files:**
- Create: `tests/lib/us-market-stance-normalize.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { normalizeUsKeySignals } from "@/lib/queries/us-market-stance";

describe("normalizeUsKeySignals", () => {
  it("splits bullish and bearish signals into separate bullet arrays", () => {
    const input = [
      { signal: "bullish", title: "Futures Rally", body: "Up 2.2% today.", source: "Yahoo" },
      { signal: "bearish", title: "Weak Exports", body: "Net sales 757 MT.", source: "USDA" },
      { signal: "watch", title: "Weather watch", body: "Rain expected.", source: "NOAA" },
    ];

    const result = normalizeUsKeySignals(input);

    expect(result.bullPoints).toEqual([
      { fact: "Futures Rally", reasoning: "Up 2.2% today." },
    ]);
    expect(result.bearPoints).toEqual([
      { fact: "Weak Exports", reasoning: "Net sales 757 MT." },
    ]);
  });

  it("returns empty arrays when input is null or empty", () => {
    expect(normalizeUsKeySignals(null)).toEqual({ bullPoints: [], bearPoints: [] });
    expect(normalizeUsKeySignals([])).toEqual({ bullPoints: [], bearPoints: [] });
  });

  it("ignores malformed entries missing title or body", () => {
    const input = [
      { signal: "bullish", title: "", body: "no title" },
      { signal: "bullish", title: "No body", body: "" },
      { signal: "bullish", title: "Good", body: "Good reason." },
    ];
    const result = normalizeUsKeySignals(input);
    expect(result.bullPoints).toEqual([{ fact: "Good", reasoning: "Good reason." }]);
    expect(result.bearPoints).toEqual([]);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npm run test -- tests/lib/us-market-stance-normalize.test.ts`
Expected: FAIL — module `@/lib/queries/us-market-stance` not found.

**Step 3: Commit the failing test**

```bash
git add tests/lib/us-market-stance-normalize.test.ts
git commit -m "test: failing spec for US key_signals → bull/bear bullets normalizer"
```

---

## Task 3: Implement `normalizeUsKeySignals` + US stance query (green)

**Files:**
- Create: `lib/queries/us-market-stance.ts`
- Reference: `lib/queries/us-intelligence.ts` (existing US market query pattern) and `lib/queries/market-stance.ts` (CA pattern for `grain_prices` lookup).

**Step 1: Write the minimal implementation**

Create `lib/queries/us-market-stance.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { US_OVERVIEW_MARKETS, toUsMarketSlug } from "@/lib/constants/us-markets";
import type { BulletPoint, GrainStanceData } from "@/components/dashboard/market-stance-chart";

interface RawSignal {
  signal?: string;
  title?: string;
  body?: string;
  source?: string;
}

export function normalizeUsKeySignals(
  signals: RawSignal[] | null | undefined,
): { bullPoints: BulletPoint[]; bearPoints: BulletPoint[] } {
  const bullPoints: BulletPoint[] = [];
  const bearPoints: BulletPoint[] = [];
  if (!Array.isArray(signals)) return { bullPoints, bearPoints };

  for (const entry of signals) {
    if (!entry || typeof entry !== "object") continue;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const body = typeof entry.body === "string" ? entry.body.trim() : "";
    if (!title || !body) continue;

    const bullet: BulletPoint = { fact: title, reasoning: body };
    if (entry.signal === "bullish") bullPoints.push(bullet);
    else if (entry.signal === "bearish") bearPoints.push(bullet);
  }

  return { bullPoints, bearPoints };
}

export async function getUsMarketStancesForOverview(
  marketYear: number,
): Promise<GrainStanceData[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("us_market_analysis")
    .select(
      "market_name, stance_score, data_confidence, initial_thesis, recommendation, key_signals, generated_at",
    )
    .eq("market_year", marketYear)
    .order("generated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch US market stances:", error);
    return [];
  }

  // Dedupe to latest generated_at per market
  const seen = new Set<string>();
  const latest = (data ?? []).filter((row) => {
    if (seen.has(row.market_name)) return false;
    seen.add(row.market_name);
    return true;
  });

  // Prior score from second-most-recent entry per market (simple approach: not stored as weekly anchor on this table)
  // For MVP: priorScore = null. Trajectory lives in us_score_trajectory and is out of scope for this task.

  // Latest prices keyed by futures grain
  const { data: prices } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price")
    .order("price_date", { ascending: false })
    .limit(30);

  const priceMap = new Map(
    (prices ?? []).map((p) => [p.grain, `$${Number(p.settlement_price).toFixed(2)}`]),
  );

  return US_OVERVIEW_MARKETS.flatMap((market) => {
    const row = latest.find((r) => r.market_name === market.name);
    if (!row) return []; // omit markets with no analysis yet (e.g. US Barley today)

    const { bullPoints, bearPoints } = normalizeUsKeySignals(row.key_signals as RawSignal[] | null);

    return [
      {
        grain: market.name,
        slug: toUsMarketSlug(market.name),
        region: "US" as const,
        score: row.stance_score ?? 0,
        priorScore: null,
        confidence: (row.data_confidence as "high" | "medium" | "low") ?? "low",
        cashPrice: priceMap.get(market.futuresGrain) ?? null,
        priceChange: null,
        thesisSummary: row.initial_thesis ?? null,
        bullPoints,
        bearPoints,
        recommendation: row.recommendation ?? null,
        detailHref: `/us/${toUsMarketSlug(market.name)}`,
      },
    ];
  });
}
```

**Step 2: Run tests to verify green**

Run: `npm run test -- tests/lib/us-market-stance-normalize.test.ts`
Expected: PASS, 3/3.

**Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Still fails at `lib/queries/market-stance.ts` (CA side not yet updated). That's Task 4.

**Step 4: Commit**

```bash
git add lib/queries/us-market-stance.ts
git commit -m "feat(queries): US market stance query with key_signals → bull/bear normalizer"
```

---

## Task 4: Extend CA `getMarketStances` to include bull/bear/region/href

**Files:**
- Modify: `lib/queries/market-stance.ts` (entire `getMarketStances` function)

**Step 1: Update SELECT + return mapping**

Replace the function body so the SELECT includes the jsonb columns and the return shape matches the extended `GrainStanceData`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { BulletPoint, GrainStanceData } from "@/components/dashboard/market-stance-chart";

const OVERVIEW_GRAINS = [
  { grain: "Wheat", slug: "wheat" },
  { grain: "Canola", slug: "canola" },
  { grain: "Barley", slug: "barley" },
  { grain: "Oats", slug: "oats" },
  { grain: "Peas", slug: "peas" },
  { grain: "Corn", slug: "corn" },
  { grain: "Flaxseed", slug: "flaxseed" },
  { grain: "Soybeans", slug: "soybeans" },
  { grain: "Amber Durum", slug: "amber-durum" },
  { grain: "Lentils", slug: "lentils" },
] as const;

const CASH_PRICE_MAP: Record<string, string> = {
  Wheat: "$276.25",
  Canola: "$662.33",
  Barley: "$232.01",
  Oats: "$142.00",
  Peas: "$298.06",
  Corn: "$4.54",
  Flaxseed: "$670.54",
  Soybeans: "$11.57",
  "Amber Durum": "$278.59",
  Lentils: "$547.50",
};

function coerceBullets(raw: unknown): BulletPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: BulletPoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const fact = typeof (entry as { fact?: unknown }).fact === "string"
      ? (entry as { fact: string }).fact.trim()
      : "";
    const reasoning = typeof (entry as { reasoning?: unknown }).reasoning === "string"
      ? (entry as { reasoning: string }).reasoning.trim()
      : "";
    if (fact && reasoning) out.push({ fact, reasoning });
  }
  return out;
}

export async function getMarketStances(grainWeek: number): Promise<GrainStanceData[]> {
  const supabase = await createClient();

  const { data: currentStances, error: currentErr } = await supabase
    .from("market_analysis")
    .select(
      "grain, grain_week, stance_score, data_confidence, generated_at, initial_thesis, bull_reasoning, bear_reasoning",
    )
    .eq("grain_week", grainWeek)
    .in("grain", OVERVIEW_GRAINS.map((g) => g.grain))
    .not("stance_score", "is", null)
    .order("generated_at", { ascending: false });

  if (currentErr) {
    console.error("Failed to fetch market stances:", currentErr);
    return [];
  }

  const { data: priorStances } = await supabase
    .from("market_analysis")
    .select("grain, stance_score")
    .eq("grain_week", grainWeek - 1)
    .in("grain", OVERVIEW_GRAINS.map((g) => g.grain))
    .not("stance_score", "is", null);

  const { data: prices } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price, change_amount")
    .order("price_date", { ascending: false })
    .limit(10);

  const priorMap = new Map(
    (priorStances ?? []).map((p) => [p.grain, p.stance_score]),
  );

  const priceMap = new Map(
    (prices ?? []).map((p) => [
      p.grain,
      {
        price: `$${Number(p.settlement_price).toFixed(2)}`,
        change: p.change_amount
          ? `${Number(p.change_amount) >= 0 ? "+" : ""}$${Number(p.change_amount).toFixed(2)}`
          : null,
      },
    ]),
  );

  const seen = new Set<string>();
  const deduped = (currentStances ?? []).filter((s) => {
    if (seen.has(s.grain)) return false;
    seen.add(s.grain);
    return true;
  });

  return OVERVIEW_GRAINS.map((g) => {
    const current = deduped.find((s) => s.grain === g.grain);
    const priceData = priceMap.get(g.grain);
    const cashPrice = priceData?.price ?? CASH_PRICE_MAP[g.grain] ?? null;

    return {
      grain: g.grain,
      slug: g.slug,
      region: "CA" as const,
      score: current?.stance_score ?? 0,
      priorScore: priorMap.get(g.grain) ?? null,
      confidence: (current?.data_confidence as "high" | "medium" | "low") ?? "low",
      cashPrice,
      priceChange: priceData?.change ?? null,
      thesisSummary: current?.initial_thesis ?? null,
      bullPoints: coerceBullets(current?.bull_reasoning),
      bearPoints: coerceBullets(current?.bear_reasoning),
      recommendation: null,
      detailHref: `/grain/${g.slug}`,
    };
  });
}
```

**Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. All `GrainStanceData` consumers now have the required fields.

**Step 3: Commit**

```bash
git add lib/queries/market-stance.ts
git commit -m "feat(queries): CA market stance returns bull/bear bullets + region + detailHref"
```

---

## Task 5: Build `UnifiedMarketStanceChart` (non-expanded rows only)

**Files:**
- Create: `components/dashboard/unified-market-stance-chart.tsx`
- Reference: `components/dashboard/market-stance-chart.tsx` (existing patterns — ConfidenceDot, getStanceColor, bar rendering)

**Step 1: Minimal component — two groups, rows render same bar layout as today, no accordion yet**

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Brain, Minus, TrendingDown, TrendingUp, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GrainStanceData } from "./market-stance-chart";

interface UnifiedMarketStanceChartProps {
  caRows: GrainStanceData[];
  caGrainWeek: number;
  usRows: GrainStanceData[];
  usMarketYear: number;
  updatedAt?: string | null;
}

function getStanceColor(score: number) {
  if (score >= 20) return "text-prairie";
  if (score > -20) return "text-muted-foreground";
  return "text-amber-600";
}

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const colors = { high: "bg-prairie", medium: "bg-canola", low: "bg-muted-foreground/40" };
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", colors[level])} title={`${level} confidence`} />;
}

function getDeltaIcon(delta: number) {
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-prairie">
        <TrendingUp className="h-3 w-3" />
        <span className="text-[11px] font-semibold tabular-nums">+{delta}</span>
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-amber-600">
        <TrendingDown className="h-3 w-3" />
        <span className="text-[11px] font-semibold tabular-nums">{delta}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Minus className="h-3 w-3" />
      <span className="text-[11px] font-semibold tabular-nums">0</span>
    </span>
  );
}

function StanceRow({ row }: { row: GrainStanceData }) {
  const delta = row.priorScore !== null ? row.score - row.priorScore : 0;
  const absScore = Math.abs(row.score);
  const isBullish = row.score > 0;
  const isBearish = row.score < 0;

  return (
    <div
      className="group grid items-center gap-2 py-1.5"
      style={{ gridTemplateColumns: "100px 28px 1fr 56px 52px 16px" }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <ConfidenceDot level={row.confidence} />
        <span className="text-sm font-medium truncate">{row.grain}</span>
      </div>
      <span className={cn("text-xs font-bold tabular-nums text-right", getStanceColor(row.score))}>
        {row.score > 0 ? "+" : ""}
        {row.score}
      </span>
      <div className="relative flex h-5 items-center rounded-sm bg-muted/20 overflow-hidden">
        <div className="absolute left-1/2 top-0 z-10 h-full w-px -translate-x-1/2 bg-border/60" />
        <div className="flex h-full w-1/2 justify-end">
          {isBearish && (
            <div
              className="h-full rounded-l-sm bg-amber-600/75 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${absScore}%` }}
            />
          )}
        </div>
        <div className="flex h-full w-1/2 justify-start">
          {isBullish && (
            <div
              className="h-full rounded-r-sm bg-prairie/85 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${absScore}%` }}
            />
          )}
        </div>
        {row.priorScore !== null && row.priorScore !== row.score && (
          <div
            className="absolute top-0 z-20 h-full w-0.5 bg-foreground/25 rounded-full"
            style={{ left: `${50 + row.priorScore / 2}%` }}
            title={`Prior: ${row.priorScore > 0 ? "+" : ""}${row.priorScore}`}
          />
        )}
      </div>
      <div className="text-right min-w-0">
        {row.cashPrice ? (
          <span className="text-[11px] text-muted-foreground tabular-nums truncate">{row.cashPrice}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground/40">—</span>
        )}
      </div>
      <div className="flex justify-end">{getDeltaIcon(delta)}</div>
      <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
    </div>
  );
}

export function UnifiedMarketStanceChart({
  caRows,
  caGrainWeek,
  usRows,
  usMarketYear,
  updatedAt,
}: UnifiedMarketStanceChartProps) {
  const prefersReducedMotion = useReducedMotion();

  const sortedCa = useMemo(() => [...caRows].sort((a, b) => b.score - a.score), [caRows]);
  const sortedUs = useMemo(() => [...usRows].sort((a, b) => b.score - a.score), [usRows]);

  const renderGroup = (label: string, rows: GrainStanceData[]) => {
    if (rows.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <div className="space-y-0.5">
          {rows.map((row, i) => {
            const content = <StanceRow key={`${row.region}:${row.slug}`} row={row} />;
            if (prefersReducedMotion) return content;
            return (
              <motion.div
                key={`${row.region}:${row.slug}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, delay: i * 0.04 }}
              >
                {content}
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-canola" />
          <span className="text-xs font-medium text-muted-foreground">AI Stance · Week {caGrainWeek}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-amber-600/80" />
            Bearish
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-prairie" />
            Bullish
          </span>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <Brain className="h-3 w-3" />
        Analyzed by 16 Agriculture Trained AI Agents
      </p>

      {renderGroup(`🇨🇦 Canadian grains · Wk ${caGrainWeek}`, sortedCa)}
      {renderGroup(`🇺🇸 US markets · MY ${usMarketYear}`, sortedUs)}

      {updatedAt && (
        <p className="text-[10px] text-muted-foreground/60 text-right">
          Updated{" "}
          {new Date(updatedAt).toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Build verify (no visual swap yet — just ensure the file compiles)**

Run: `npm run build`
Expected: PASS. Component is unused but type-safe.

**Step 3: Commit**

```bash
git add components/dashboard/unified-market-stance-chart.tsx
git commit -m "feat(ui): UnifiedMarketStanceChart with CA + US region groups (no accordion)"
```

---

## Task 6: Add accordion expand/collapse behavior with bull/bear panel

**Files:**
- Modify: `components/dashboard/unified-market-stance-chart.tsx`

**Step 1: Promote `StanceRow` to a button + add expandable panel**

Replace `StanceRow` and update the group renderer so the parent component controls a single `expandedKey` state.

Add at top (after imports):

```tsx
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
```

Replace the existing `StanceRow` component with:

```tsx
function BulletColumn({
  title,
  points,
  tone,
  emptyLabel,
}: {
  title: string;
  points: { fact: string; reasoning: string }[];
  tone: "bull" | "bear";
  emptyLabel: string;
}) {
  const toneClass = tone === "bull" ? "text-prairie" : "text-amber-600";
  return (
    <div className="space-y-2">
      <p className={cn("text-xs font-semibold uppercase tracking-wider", toneClass)}>{title}</p>
      {points.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {points.map((p, i) => (
            <li key={i} className="space-y-0.5">
              <p className="text-sm font-medium">{p.fact}</p>
              <p className="text-xs text-muted-foreground">{p.reasoning}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StanceRow({
  row,
  isOpen,
  onToggle,
}: {
  row: GrainStanceData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const delta = row.priorScore !== null ? row.score - row.priorScore : 0;
  const absScore = Math.abs(row.score);
  const isBullish = row.score > 0;
  const isBearish = row.score < 0;
  const rowKey = `${row.region}:${row.slug}`;
  const panelId = `stance-panel-${rowKey}`;
  const buttonId = `stance-button-${rowKey}`;

  return (
    <div>
      <button
        id={buttonId}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="grid w-full items-center gap-2 py-1.5 text-left hover:bg-muted/10 rounded-sm px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-canola"
        style={{ gridTemplateColumns: "100px 28px 1fr 56px 52px 16px" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ConfidenceDot level={row.confidence} />
          <span className="text-sm font-medium truncate">{row.grain}</span>
        </div>
        <span className={cn("text-xs font-bold tabular-nums text-right", getStanceColor(row.score))}>
          {row.score > 0 ? "+" : ""}
          {row.score}
        </span>
        <div className="relative flex h-5 items-center rounded-sm bg-muted/20 overflow-hidden">
          <div className="absolute left-1/2 top-0 z-10 h-full w-px -translate-x-1/2 bg-border/60" />
          <div className="flex h-full w-1/2 justify-end">
            {isBearish && (
              <div
                className="h-full rounded-l-sm bg-amber-600/75"
                style={{ width: `${absScore}%` }}
              />
            )}
          </div>
          <div className="flex h-full w-1/2 justify-start">
            {isBullish && (
              <div
                className="h-full rounded-r-sm bg-prairie/85"
                style={{ width: `${absScore}%` }}
              />
            )}
          </div>
          {row.priorScore !== null && row.priorScore !== row.score && (
            <div
              className="absolute top-0 z-20 h-full w-0.5 bg-foreground/25 rounded-full"
              style={{ left: `${50 + row.priorScore / 2}%` }}
              title={`Prior: ${row.priorScore > 0 ? "+" : ""}${row.priorScore}`}
            />
          )}
        </div>
        <div className="text-right min-w-0">
          {row.cashPrice ? (
            <span className="text-[11px] text-muted-foreground tabular-nums truncate">{row.cashPrice}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          )}
        </div>
        <div className="flex justify-end">{getDeltaIcon(delta)}</div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/60 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
            className="overflow-hidden"
          >
            <div className="pt-3 pb-4 px-1 space-y-3">
              <div className="grid gap-4 md:grid-cols-2">
                <BulletColumn
                  title="Bull case"
                  points={row.bullPoints}
                  tone="bull"
                  emptyLabel="No bull case recorded this week."
                />
                <BulletColumn
                  title="Bear case"
                  points={row.bearPoints}
                  tone="bear"
                  emptyLabel="No bear case recorded this week."
                />
              </div>
              {row.thesisSummary && (
                <p className="text-sm leading-6 text-muted-foreground">{row.thesisSummary}</p>
              )}
              {row.recommendation && (
                <p className="text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">Call: </span>
                  <span className="font-medium">{row.recommendation.replace(/_/g, " ")}</span>
                </p>
              )}
              <Link
                href={row.detailHref}
                className="inline-flex text-xs font-medium text-canola hover:underline"
              >
                Open {row.region === "US" ? "full US thesis" : "grain page"} →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Wire `expandedKey` in `UnifiedMarketStanceChart`**

Inside `UnifiedMarketStanceChart`, above the `sortedCa` memo, add:

```tsx
const [expandedKey, setExpandedKey] = useState<string | null>(null);
```

In `renderGroup`, change the inner row render so each row receives the open flag + toggler:

```tsx
const key = `${row.region}:${row.slug}`;
const content = (
  <StanceRow
    row={row}
    isOpen={expandedKey === key}
    onToggle={() => setExpandedKey((prev) => (prev === key ? null : key))}
  />
);
```

**Step 3: Build verify**

Run: `npm run build`
Expected: PASS.

**Step 4: Commit**

```bash
git add components/dashboard/unified-market-stance-chart.tsx
git commit -m "feat(ui): accordion rows with two-column bull/bear bullet panel"
```

---

## Task 7: Replace Overview page contents

**Files:**
- Modify: `app/(dashboard)/overview/page.tsx` (full rewrite)
- Reference (for deletion confirmation only): `components/dashboard/sentiment-banner.tsx`, `components/dashboard/market-snapshot-grid.tsx`, `components/dashboard/logistics-banner.tsx`, `app/(dashboard)/overview/signal-strip-with-voting.tsx`

**Step 1: Rewrite the page**

Replace the entire file contents with:

```tsx
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { UnifiedMarketStanceChart } from "@/components/dashboard/unified-market-stance-chart";
import { GlassCard } from "@/components/ui/glass-card";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { getMarketStances } from "@/lib/queries/market-stance";
import { getUsMarketStancesForOverview } from "@/lib/queries/us-market-stance";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const grainWeek = await getLatestImportedWeek();

  const [caResult, usResult] = await Promise.all([
    safeQuery("CA market stances", () => getMarketStances(grainWeek)),
    safeQuery("US market stances", () => getUsMarketStancesForOverview(CURRENT_US_MARKET_YEAR)),
  ]);

  const caRows = caResult.data ?? [];
  const usRows = usResult.data ?? [];
  const hasAny = caRows.length > 0 || usRows.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
      <section>
        <SectionHeader
          title="AI Market Stance"
          subtitle="Weekly bullish/bearish scoring across prairie grains and US markets, with bull and bear points"
        />
        <div className="mt-4">
          <GlassCard elevation={2} hover={false}>
            <div className="p-5">
              {hasAny ? (
                <UnifiedMarketStanceChart
                  caRows={caRows}
                  caGrainWeek={grainWeek}
                  usRows={usRows}
                  usMarketYear={CURRENT_US_MARKET_YEAR}
                  updatedAt={new Date().toISOString()}
                />
              ) : (
                <SectionStateCard
                  title="Market stance temporarily unavailable"
                  message="Canadian and US stance data are both unavailable right now. Please refresh shortly."
                />
              )}
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Build verify**

Run: `npm run build`
Expected: PASS, no unused-import warnings in `overview/page.tsx`.

**Step 3: Visual verify**

Start dev server, open `http://localhost:3001/overview`, confirm:
- Single card visible with CA group (10 rows) + US group (4 rows: Oats, Wheat, Soybeans, Corn).
- Clicking any row expands inline panel with bull column (green) + bear column (amber).
- Clicking a second row collapses the first and expands the new one.
- No references to Canadian Grain Market Snapshot / Logistics Banner / Community Pulse remain.

Use preview tools: `preview_start`, then `preview_screenshot` after navigating.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/overview/page.tsx
git commit -m "feat(overview): unified AI Market Stance card replaces CGC snapshot + community pulse"
```

---

## Task 8: Orphan check for previously-used components

**Files:**
- Read-only grep across repo

**Step 1: Confirm removed imports still have other callers**

For each symbol removed from `overview/page.tsx`, grep for remaining imports to confirm it isn't dead code:

Run:
```bash
grep -rn "MarketSnapshotGrid" app components lib --include="*.tsx" --include="*.ts"
grep -rn "LogisticsBanner" app components lib --include="*.tsx" --include="*.ts"
grep -rn "SentimentBanner" app components lib --include="*.tsx" --include="*.ts"
grep -rn "SignalStripWithVoting" app components lib --include="*.tsx" --include="*.ts"
grep -rn "getMarketOverviewSnapshot" app components lib --include="*.tsx" --include="*.ts"
grep -rn "getLogisticsSnapshotRaw" app components lib --include="*.tsx" --include="*.ts"
grep -rn "getAggregateTerminalFlow" app components lib --include="*.tsx" --include="*.ts"
grep -rn "getLatestXSignals" app components lib --include="*.tsx" --include="*.ts"
grep -rn "MarketStanceChart" app components lib --include="*.tsx" --include="*.ts"
```

**Step 2: Record findings**

For each symbol, one of:
- **Still imported elsewhere** → no action, move on.
- **Zero callers** → flag in the commit body below as "potential follow-up: X is now unused on the overview and nowhere else; consider removal in a future PR." Do NOT delete in this PR.

**Step 3: Commit findings (only if notes were recorded)**

If any orphans were found, add a short note to `docs/lessons-learned/issues.md` with today's date and the list, then:

```bash
git add docs/lessons-learned/issues.md
git commit -m "docs: note components orphaned by overview bull/bear unification"
```

Otherwise no commit.

---

## Task 9: Full verification + deploy prep

**Files:** whole repo (no edits)

**Step 1: Lint + typecheck + build**

Run:
```bash
npx tsc --noEmit
npm run build
npm run test
```
Expected: all PASS. Vitest runs the new normalizer test plus the existing suite.

**Step 2: Visual regression — three scenarios**

Using `preview_start` → `preview_screenshot`:
1. Default (both regions populated).
2. Simulate CA-only by temporarily setting `usRows = []` on dev → screenshot → revert.
3. Simulate mobile (375px) by `preview_resize` → screenshot with a row expanded.

**Step 3: Update STATUS.md + README.md**

Per CLAUDE.md Definition of Done rule 6: add a new track entry to `docs/plans/STATUS.md` and the compressed log line in `README.md` describing the Overview bull/bear unification.

**Step 4: Final commit**

```bash
git add docs/plans/STATUS.md README.md
git commit -m "docs: log overview bull/bear unification in STATUS and README"
```

**Step 5: Push + deploy**

```bash
git push
```
Vercel auto-deploys on push to master. After deploy, run the `qc-crawler` agent per CLAUDE.md DAG gate 6 to confirm the Overview page renders correctly in production.

---

## Rollback plan

If production renders wrong:
1. `git revert HEAD~N..HEAD` where N covers the feature commits (roughly 7-8 commits).
2. Push revert. Vercel redeploys the prior Overview.
3. The old `MarketStanceChart`, `MarketSnapshotGrid`, `LogisticsBanner`, and community-pulse components are unchanged, so nothing else breaks.

## Summary of deliverables

| Task | File | Type | TDD? |
|-----|------|------|------|
| 1 | `components/dashboard/market-stance-chart.tsx` | Types | N/A |
| 2 | `tests/lib/us-market-stance-normalize.test.ts` | Red test | ✅ |
| 3 | `lib/queries/us-market-stance.ts` | Impl (green) | ✅ |
| 4 | `lib/queries/market-stance.ts` | Extension | — |
| 5 | `components/dashboard/unified-market-stance-chart.tsx` | UI (no accordion) | — |
| 6 | `components/dashboard/unified-market-stance-chart.tsx` | UI (accordion) | — |
| 7 | `app/(dashboard)/overview/page.tsx` | Rewrite | — |
| 8 | (grep only) | Dead-code check | — |
| 9 | `docs/plans/STATUS.md`, `README.md` | Docs | — |

Total commits: ~8. Total estimated time: ~2 focused hours for an engineer familiar with the codebase.
