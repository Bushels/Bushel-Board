# Seeding Progress Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/seeding` route that visualizes weekly USDA crop progress across the US grain belt as a Mapbox map of state-level "seismograph" glyphs with a temporal scrubber.

**Architecture:** Phase A wires data (USDA per-state ingestion + reference table + RPC + query layer). Phase B wires UI (server page + Mapbox client component + SVG glyph + scrubber + a11y fallback). Phase A ships and is verifiable independently; Phase B builds on Phase A's contract.

**Tech Stack:** Next.js 16 App Router, TypeScript, react-map-gl 8.1, mapbox-gl 3.19, Supabase (Postgres + RPC), Vitest, Tailwind, Python (existing ingestion).

**Spec:** [docs/plans/2026-04-27-seeding-progress-map-design.md](docs/plans/2026-04-27-seeding-progress-map-design.md)

---

## File Structure

### Phase A — Data Layer (PR 1, ~5 tasks)

| File | Responsibility |
|---|---|
| `supabase/migrations/20260428000000_us_state_centroids.sql` | Reference table + 15 grain-belt seed rows |
| `supabase/migrations/20260428000100_get_seeding_seismograph.sql` | RPC returning per-(state, week) shaped rows for the glyph |
| `scripts/import-usda-crop-progress.py` | **Modify:** stop filtering to US TOTAL; ingest per-state grain-belt rows |
| `lib/queries/seeding-progress-utils.ts` | Client-safe types + pure helpers (no Supabase imports) |
| `lib/queries/seeding-progress.ts` | Server query wrapper (Supabase RPC call) |
| `lib/__tests__/seeding-progress.test.ts` | Tests for query layer + utils |

### Phase B — UI Layer (PR 2, ~9 tasks)

| File | Responsibility |
|---|---|
| `components/dashboard/seeding-canada-placeholder.tsx` | Amber banner: "Provincial seeding data starts mid-May" |
| `components/dashboard/seeding-table-fallback.tsx` | Server component: a11y / reduced-motion table view |
| `components/dashboard/seeding-seismograph-glyph.tsx` | Pure SVG glyph (one state's weekly trajectory) |
| `components/dashboard/seeding-scrubber.tsx` | Client: week slider + replay button |
| `components/dashboard/seeding-legend.tsx` | Client: legend overlay |
| `components/dashboard/seeding-map.tsx` | Client: react-map-gl wrapper + glyph markers + scrubber integration |
| `app/(dashboard)/seeding/client.tsx` | Client transition wrapper |
| `app/(dashboard)/seeding/page.tsx` | Server: fetches data, composes page |
| `components/__tests__/seeding-seismograph-glyph.test.tsx` | Glyph rendering tests |

---

## Phase A — Data Layer

### Task A1: State centroids reference table

**Files:**
- Create: `supabase/migrations/20260428000000_us_state_centroids.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: us_state_centroids reference table
-- Powers /seeding map glyph anchoring without client-side GeoJSON computation.

CREATE TABLE IF NOT EXISTS us_state_centroids (
  state_code text PRIMARY KEY,
  state_name text NOT NULL,
  centroid_lng numeric NOT NULL,
  centroid_lat numeric NOT NULL,
  is_grain_belt boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE us_state_centroids IS
  'US state centroid coordinates for /seeding map glyph anchoring. Read-only after seed.';

INSERT INTO us_state_centroids (state_code, state_name, centroid_lng, centroid_lat, is_grain_belt) VALUES
  ('IA', 'Iowa',          -93.50, 42.07, true),
  ('IL', 'Illinois',      -89.20, 40.05, true),
  ('IN', 'Indiana',       -86.13, 39.85, true),
  ('OH', 'Ohio',          -82.78, 40.30, true),
  ('NE', 'Nebraska',      -99.79, 41.50, true),
  ('KS', 'Kansas',        -98.38, 38.50, true),
  ('MO', 'Missouri',      -92.60, 38.45, true),
  ('SD', 'South Dakota',  -99.45, 44.30, true),
  ('ND', 'North Dakota',  -100.30, 47.50, true),
  ('MN', 'Minnesota',     -94.30, 46.30, true),
  ('WI', 'Wisconsin',     -89.99, 44.62, true),
  ('MI', 'Michigan',      -84.62, 44.33, true),
  ('KY', 'Kentucky',      -84.27, 37.53, true),
  ('AR', 'Arkansas',      -92.44, 34.90, true),
  ('TX', 'Texas',         -99.34, 31.05, true)
ON CONFLICT (state_code) DO NOTHING;

GRANT SELECT ON us_state_centroids TO anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Verify rows landed**

Run via Supabase SQL editor or psql:
```sql
SELECT count(*) AS n, count(*) FILTER (WHERE is_grain_belt) AS belt
FROM us_state_centroids;
```
Expected: `n=15, belt=15`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428000000_us_state_centroids.sql
git commit -m "feat(seeding): add us_state_centroids reference table"
```

---

### Task A2: Expand USDA crop progress ingestion

**Files:**
- Modify: `scripts/import-usda-crop-progress.py`

- [ ] **Step 1: Read current ingestion logic**

Read the existing script and locate the row filter that drops non-`US TOTAL` rows. From the audit, this filter sits inside the row build loop where `state` is set:

```python
"state": str(row.get("state_name") or row.get("location_desc") or "US TOTAL").strip() or "US TOTAL",
```

And later code filters with `"state": "eq.US TOTAL"` for upsert. We're keeping the canonical US TOTAL rows AND adding grain-belt state rows.

- [ ] **Step 2: Define the grain-belt allowlist**

At the top of the script (with other constants):

```python
GRAIN_BELT_STATES = {
    "IOWA", "ILLINOIS", "INDIANA", "OHIO", "NEBRASKA", "KANSAS",
    "MISSOURI", "SOUTH DAKOTA", "NORTH DAKOTA", "MINNESOTA",
    "WISCONSIN", "MICHIGAN", "KENTUCKY", "ARKANSAS", "TEXAS",
}
```

- [ ] **Step 3: Modify the row-keep predicate**

Find the loop that builds rows for upsert. Change the keep condition so the script keeps rows where `state == "US TOTAL"` OR `state in GRAIN_BELT_STATES`:

```python
state_value = str(row.get("state_name") or row.get("location_desc") or "US TOTAL").strip() or "US TOTAL"
state_upper = state_value.upper()
if state_upper != "US TOTAL" and state_upper not in GRAIN_BELT_STATES:
    continue  # skip non-belt states
record["state"] = state_value
```

- [ ] **Step 4: Run the import for the latest week**

Run: `npm run import-usda-crop-progress`
Expected: stdout shows row counts; new state-level rows are upserted alongside US TOTAL.

- [ ] **Step 5: Verify state-level rows landed**

Run via Supabase SQL editor:
```sql
SELECT state, count(*) AS rows
FROM usda_crop_progress
WHERE commodity = 'CORN'
GROUP BY state
ORDER BY state;
```
Expected: `US TOTAL` plus the 15 grain-belt state names each with at least one row.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-usda-crop-progress.py
git commit -m "feat(seeding): ingest per-state USDA crop progress for grain belt"
```

---

### Task A3: get_seeding_seismograph RPC

**Files:**
- Create: `supabase/migrations/20260428000100_get_seeding_seismograph.sql`

- [ ] **Step 1: Write the RPC migration**

```sql
-- Migration: get_seeding_seismograph RPC
-- Returns per-(state, week) rows shaped for the /seeding map glyph.
-- ~480 rows for a full season (15 states x 32 weeks). Well under PostgREST 1000-row cap.

CREATE OR REPLACE FUNCTION get_seeding_seismograph(
  p_commodity text,
  p_market_year smallint
)
RETURNS TABLE (
  state_code      text,
  state_name      text,
  centroid_lng    numeric,
  centroid_lat    numeric,
  week_ending     date,
  planted_pct     numeric,
  emerged_pct     numeric,
  harvested_pct   numeric,
  planted_pct_vs_avg numeric,
  good_excellent_pct numeric,
  condition_index numeric,
  ge_pct_yoy_change  numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.state_code,
    c.state_name,
    c.centroid_lng,
    c.centroid_lat,
    p.week_ending,
    p.planted_pct,
    p.emerged_pct,
    p.harvested_pct,
    p.planted_pct_vs_avg,
    p.good_excellent_pct,
    p.condition_index,
    p.ge_pct_yoy_change
  FROM usda_crop_progress p
  JOIN us_state_centroids c
    ON UPPER(c.state_name) = UPPER(p.state)
  WHERE p.commodity = p_commodity
    AND EXTRACT(YEAR FROM p.week_ending)::smallint = p_market_year
    AND c.is_grain_belt = true
  ORDER BY c.state_code, p.week_ending;
$$;

GRANT EXECUTE ON FUNCTION get_seeding_seismograph(text, smallint) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration applies cleanly.

- [ ] **Step 3: Smoke-test the RPC**

Run via Supabase SQL editor (or `curl /rest/v1/rpc/get_seeding_seismograph` for PostgREST verification):
```sql
SELECT state_code, week_ending, planted_pct, condition_index
FROM get_seeding_seismograph('CORN', 2026::smallint)
ORDER BY state_code, week_ending
LIMIT 5;
```
Expected: 5 rows with non-null state_code and week_ending. If empty, re-check Task A2 ingestion.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428000100_get_seeding_seismograph.sql
git commit -m "feat(seeding): add get_seeding_seismograph RPC"
```

---

### Task A4: Client-safe types and pure helpers

**Files:**
- Create: `lib/queries/seeding-progress-utils.ts`
- Create: `lib/__tests__/seeding-progress-utils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/seeding-progress-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  conditionStrokeColor,
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";

const sampleRows: SeismographRow[] = [
  {
    state_code: "IA", state_name: "Iowa",
    centroid_lng: -93.5, centroid_lat: 42.07,
    week_ending: "2026-05-04", planted_pct: 25, emerged_pct: 7,
    harvested_pct: 0, planted_pct_vs_avg: 6,
    good_excellent_pct: 70, condition_index: 3.6, ge_pct_yoy_change: 4,
  },
  {
    state_code: "IA", state_name: "Iowa",
    centroid_lng: -93.5, centroid_lat: 42.07,
    week_ending: "2026-05-11", planted_pct: 55, emerged_pct: 22,
    harvested_pct: 0, planted_pct_vs_avg: 8,
    good_excellent_pct: 72, condition_index: 3.7, ge_pct_yoy_change: 5,
  },
  {
    state_code: "KS", state_name: "Kansas",
    centroid_lng: -98.38, centroid_lat: 38.5,
    week_ending: "2026-05-04", planted_pct: 18, emerged_pct: 4,
    harvested_pct: 0, planted_pct_vs_avg: -2,
    good_excellent_pct: 35, condition_index: 2.4, ge_pct_yoy_change: -19,
  },
];

describe("seeding-progress-utils", () => {
  describe("groupByState", () => {
    it("groups rows by state_code preserving week order", () => {
      const grouped = groupByState(sampleRows);
      expect(Object.keys(grouped).sort()).toEqual(["IA", "KS"]);
      expect(grouped.IA).toHaveLength(2);
      expect(grouped.IA[0].week_ending).toBe("2026-05-04");
      expect(grouped.IA[1].week_ending).toBe("2026-05-11");
    });
  });

  describe("conditionStrokeColor", () => {
    it("returns prairie green for positive YoY", () => {
      expect(conditionStrokeColor(5)).toBe("#437a22");
    });
    it("returns wheat-700 neutral for zero YoY", () => {
      expect(conditionStrokeColor(0)).toBe("#5a4f36");
    });
    it("returns amber for moderate negative", () => {
      expect(conditionStrokeColor(-8)).toBe("#d97706");
    });
    it("returns crimson for severe negative", () => {
      expect(conditionStrokeColor(-19)).toBe("#b8350f");
    });
    it("treats null as neutral", () => {
      expect(conditionStrokeColor(null)).toBe("#5a4f36");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/seeding-progress-utils.test.ts`
Expected: FAIL with module-not-found / type errors.

- [ ] **Step 3: Write the utils module**

```ts
// lib/queries/seeding-progress-utils.ts
// Client-safe types and pure helpers. NO Supabase imports.

export interface SeismographRow {
  state_code: string;
  state_name: string;
  centroid_lng: number;
  centroid_lat: number;
  week_ending: string; // ISO date
  planted_pct: number | null;
  emerged_pct: number | null;
  harvested_pct: number | null;
  planted_pct_vs_avg: number | null;
  good_excellent_pct: number | null;
  condition_index: number | null;
  ge_pct_yoy_change: number | null;
}

export type SeismographByState = Record<string, SeismographRow[]>;

/**
 * Group seismograph rows by state_code. Each state's rows preserve
 * chronological order by week_ending (RPC returns sorted).
 */
export function groupByState(rows: SeismographRow[]): SeismographByState {
  const out: SeismographByState = {};
  for (const r of rows) {
    if (!out[r.state_code]) out[r.state_code] = [];
    out[r.state_code].push(r);
  }
  return out;
}

/**
 * Condition stroke color encodes YoY good/excellent change.
 * Returns design-token hex values (no CSS variables — SVG can't resolve them).
 */
export function conditionStrokeColor(yoyChange: number | null): string {
  if (yoyChange === null) return "#5a4f36"; // wheat-700 neutral
  if (yoyChange >= 3) return "#437a22"; // prairie green improving
  if (yoyChange > -3) return "#5a4f36"; // wheat-700 stable
  if (yoyChange > -15) return "#d97706"; // amber slipping
  return "#b8350f"; // crimson collapse
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/seeding-progress-utils.test.ts`
Expected: PASS, 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/seeding-progress-utils.ts lib/__tests__/seeding-progress-utils.test.ts
git commit -m "feat(seeding): add client-safe types and helpers for seismograph"
```

---

### Task A5: Server query wrapper

**Files:**
- Create: `lib/queries/seeding-progress.ts`

- [ ] **Step 1: Write the server query**

```ts
// lib/queries/seeding-progress.ts
// Server-only Supabase RPC wrapper. Re-exports utils for convenient single-import.

import { createClient } from "@/lib/supabase/server";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";

export type { SeismographRow, SeismographByState } from "@/lib/queries/seeding-progress-utils";
export { groupByState, conditionStrokeColor } from "@/lib/queries/seeding-progress-utils";

/**
 * Fetch the full per-state, per-week seismograph dataset for one commodity.
 * Returns ~480 rows (15 grain-belt states x ~32 weeks). PostgREST safe.
 */
export async function getSeedingSeismograph(
  commodity: string,
  marketYear: number,
): Promise<SeismographRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_seeding_seismograph", {
    p_commodity: commodity.toUpperCase(),
    p_market_year: marketYear,
  });
  if (error) {
    console.error("getSeedingSeismograph RPC error:", error);
    return [];
  }
  return (data ?? []) as SeismographRow[];
}
```

- [ ] **Step 2: Smoke test from a Node REPL**

Run a one-shot tsx script to verify the wrapper works:
```bash
npx tsx -e "import('./lib/queries/seeding-progress').then(async m => { const rows = await m.getSeedingSeismograph('CORN', 2026); console.log('rows:', rows.length, 'first:', rows[0]); })"
```
Expected: `rows: <N>` where N > 0; `first` is a row with state_code and week_ending.

(If your environment uses Supabase service role only via Edge Functions, skip the REPL and rely on the integration smoke in Task A6.)

- [ ] **Step 3: Commit**

```bash
git add lib/queries/seeding-progress.ts
git commit -m "feat(seeding): add server query wrapper for seismograph RPC"
```

---

### Task A6: Phase A integration verification

**Files:** none new — verifies A1–A5 stand together.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `seeding-progress-utils.test.ts`.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 3: Verify ingestion → RPC chain**

Run via Supabase SQL editor:
```sql
SELECT state_code, week_ending, planted_pct, emerged_pct, condition_index
FROM get_seeding_seismograph('CORN', 2026::smallint)
ORDER BY state_code, week_ending DESC
LIMIT 10;
```
Expected: 10 rows, mixed states, week_ending dates within the current planting season.

- [ ] **Step 4: Tag Phase A as a checkpoint**

```bash
git tag seeding-phase-a-complete
```

Phase A ships independently. Phase B can begin.

---

## Phase B — UI Layer

### Task B1: Canada placeholder banner

**Files:**
- Create: `components/dashboard/seeding-canada-placeholder.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/seeding-canada-placeholder.tsx
// Amber banner explaining the v1 US-only scope.

export function SeedingCanadaPlaceholder() {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-amber-300/40 bg-amber-50/60 p-4 text-sm"
      role="note"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <path fill="#d97706" d="M11 2 21 19H1L11 2Z" />
        <rect x="10" y="8" width="2" height="6" fill="#fff7e8" />
        <rect x="10" y="16" width="2" height="2" fill="#fff7e8" />
      </svg>
      <div>
        <strong className="font-semibold text-foreground">
          Canada seeding layer coming mid-May.
        </strong>
        <p className="mt-1 text-muted-foreground">
          US grain belt shown first. Provincial seeding data is not in the
          database yet — AB / SK / MB will appear here as crop reports release.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/seeding-canada-placeholder.tsx
git commit -m "feat(seeding): Canada placeholder banner"
```

---

### Task B2: Table fallback (a11y / reduced-motion)

**Files:**
- Create: `components/dashboard/seeding-table-fallback.tsx`

- [ ] **Step 1: Write the table fallback**

```tsx
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
      <table className="w-full text-sm" aria-label={`${commodity} seeding progress by state, week ending ${weekEnding}`}>
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
                {r.state_code} <span className="text-muted-foreground">{r.state_name}</span>
              </td>
              <td className="px-4 py-2">{fmtPct(r.planted_pct)}</td>
              <td className="px-4 py-2">{fmtPct(r.emerged_pct)}</td>
              <td className="px-4 py-2">{fmtPct(r.harvested_pct)}</td>
              <td className="px-4 py-2">
                {r.planted_pct_vs_avg === null
                  ? "—"
                  : `${r.planted_pct_vs_avg > 0 ? "+" : ""}${Math.round(r.planted_pct_vs_avg)} pts`}
              </td>
              <td className="px-4 py-2">{fmtPct(r.good_excellent_pct)}</td>
              <td className="px-4 py-2">
                {r.ge_pct_yoy_change === null
                  ? "—"
                  : `${r.ge_pct_yoy_change > 0 ? "+" : ""}${Math.round(r.ge_pct_yoy_change)} pts`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/seeding-table-fallback.tsx
git commit -m "feat(seeding): a11y table fallback for seismograph map"
```

---

### Task B3: Seismograph glyph component

**Files:**
- Create: `components/dashboard/seeding-seismograph-glyph.tsx`
- Create: `components/__tests__/seeding-seismograph-glyph.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/seeding-seismograph-glyph.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SeismographGlyph } from "@/components/dashboard/seeding-seismograph-glyph";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";

const stateRows: SeismographRow[] = Array.from({ length: 5 }, (_, i) => ({
  state_code: "IA",
  state_name: "Iowa",
  centroid_lng: -93.5,
  centroid_lat: 42.07,
  week_ending: `2026-05-${String(4 + i * 7).padStart(2, "0")}`,
  planted_pct: i * 20,
  emerged_pct: Math.max(0, (i - 1) * 15),
  harvested_pct: 0,
  planted_pct_vs_avg: 5,
  good_excellent_pct: 70 - i,
  condition_index: 3.5 + i * 0.05,
  ge_pct_yoy_change: 4,
}));

describe("SeismographGlyph", () => {
  it("renders state code and crop label", () => {
    const { container } = render(
      <SeismographGlyph
        rows={stateRows}
        commodity="Corn"
        currentWeek="2026-05-25"
      />,
    );
    expect(container.textContent).toContain("IA");
    expect(container.textContent).toContain("Corn");
  });

  it("renders an SVG of expected dimensions", () => {
    const { container } = render(
      <SeismographGlyph
        rows={stateRows}
        commodity="Corn"
        currentWeek="2026-05-25"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 64 48");
  });

  it("shows up arrow when YoY is positive", () => {
    const { container } = render(
      <SeismographGlyph
        rows={stateRows}
        commodity="Corn"
        currentWeek="2026-05-25"
      />,
    );
    const upArrow = container.querySelector(".arrow-up");
    expect(upArrow).not.toBeNull();
  });

  it("shows down arrow with crimson when YoY is severely negative", () => {
    const negRows = stateRows.map((r) => ({ ...r, ge_pct_yoy_change: -19 }));
    const { container } = render(
      <SeismographGlyph
        rows={negRows}
        commodity="Corn"
        currentWeek="2026-05-25"
      />,
    );
    const downArrow = container.querySelector(".arrow-down");
    expect(downArrow).not.toBeNull();
  });

  it("returns null on empty rows", () => {
    const { container } = render(
      <SeismographGlyph rows={[]} commodity="Corn" currentWeek="2026-05-25" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/__tests__/seeding-seismograph-glyph.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the glyph component**

```tsx
// components/dashboard/seeding-seismograph-glyph.tsx
// Pure SVG glyph: one state's weekly seismograph in 64x48px.

import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";
import { conditionStrokeColor } from "@/lib/queries/seeding-progress-utils";

interface Props {
  rows: SeismographRow[]; // chronologically ordered for ONE state
  commodity: string;
  currentWeek: string; // ISO date — drives scan-line position
}

const W = 64;
const H = 48;
const PAD_X = 6;
const PAD_TOP = 14; // headroom for state code + crop label
const PAD_BOTTOM = 6;
const PLOT_W = W - PAD_X * 2;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function valueAt(rows: SeismographRow[], week: string, key: keyof SeismographRow): number | null {
  const row = rows.find((r) => r.week_ending === week) ?? rows[rows.length - 1];
  const v = row?.[key];
  return typeof v === "number" ? v : null;
}

function buildAreaPath(rows: SeismographRow[], key: keyof SeismographRow): string {
  if (rows.length === 0) return "";
  const xs = rows.map((_, i) => PAD_X + (i / Math.max(rows.length - 1, 1)) * PLOT_W);
  const ys = rows.map((r) => {
    const raw = r[key];
    const pct = typeof raw === "number" ? raw : 0;
    return PAD_TOP + PLOT_H - (pct / 100) * PLOT_H;
  });
  let d = `M${xs[0].toFixed(2)} ${(PAD_TOP + PLOT_H).toFixed(2)} `;
  d += `L${xs[0].toFixed(2)} ${ys[0].toFixed(2)} `;
  for (let i = 1; i < rows.length; i++) {
    d += `L${xs[i].toFixed(2)} ${ys[i].toFixed(2)} `;
  }
  d += `L${xs[xs.length - 1].toFixed(2)} ${(PAD_TOP + PLOT_H).toFixed(2)} Z`;
  return d;
}

function scanLineX(rows: SeismographRow[], currentWeek: string): number {
  if (rows.length === 0) return PAD_X;
  const idx = rows.findIndex((r) => r.week_ending === currentWeek);
  const i = idx === -1 ? rows.length - 1 : idx;
  return PAD_X + (i / Math.max(rows.length - 1, 1)) * PLOT_W;
}

export function SeismographGlyph({ rows, commodity, currentWeek }: Props) {
  if (rows.length === 0) return null;

  const stateCode = rows[0].state_code;
  const yoy = valueAt(rows, currentWeek, "ge_pct_yoy_change");
  const conditionIdx = valueAt(rows, currentWeek, "condition_index") ?? 3;
  const stroke = conditionStrokeColor(yoy);
  const condStrokeW = Math.max(1, Math.min(4, conditionIdx));

  const plantedPath = buildAreaPath(rows, "planted_pct");
  const emergedPath = buildAreaPath(rows, "emerged_pct");
  const harvestedPath = buildAreaPath(rows, "harvested_pct");
  const xScan = scanLineX(rows, currentWeek);

  const arrowUp = (yoy ?? 0) >= 3;
  const arrowDown = (yoy ?? 0) <= -3;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${stateCode} ${commodity} weekly progress`}
      style={{ filter: "drop-shadow(0 3px 6px rgba(26,24,19,.14))" }}
    >
      <rect x={1} y={1} width={W - 2} height={H - 2} rx={9}
            fill="#ece8dc" stroke="#e0d9c5" strokeWidth={1} />
      <text x={6} y={10} fontSize={7.5} fontWeight={700} fill="#1a1813"
            fontFamily="DM Sans, sans-serif">
        {stateCode}
      </text>
      <text x={22} y={10} fontSize={7.5} fontWeight={600} fill="#6b6353"
            fontFamily="DM Sans, sans-serif">
        {commodity}
      </text>
      {arrowUp && (
        <path className="arrow-up" d="M54 5 59 13 49 13Z" fill="#437a22" />
      )}
      {arrowDown && (
        <path className="arrow-down" d="M54 13 59 5 49 5Z"
              fill={(yoy ?? 0) <= -15 ? "#b8350f" : "#d97706"} />
      )}
      <path d={plantedPath} fill="#c17f24" opacity={0.85} />
      <path d={emergedPath} fill="#e8b96b" opacity={0.85} />
      <path d={harvestedPath} fill="#7ba84e" opacity={0.85} />
      <line x1={xScan} y1={PAD_TOP} x2={xScan} y2={PAD_TOP + PLOT_H}
            stroke="#c17f24" strokeWidth={1.5} />
      <path d={`M${PAD_X} ${H - 4} Q ${W / 2} ${H - 6 + condStrokeW} ${W - PAD_X} ${H - 4}`}
            fill="none" stroke={stroke} strokeWidth={condStrokeW} strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/__tests__/seeding-seismograph-glyph.test.tsx`
Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/seeding-seismograph-glyph.tsx components/__tests__/seeding-seismograph-glyph.test.tsx
git commit -m "feat(seeding): seismograph glyph SVG component"
```

---

### Task B4: Scrubber

**Files:**
- Create: `components/dashboard/seeding-scrubber.tsx`

- [ ] **Step 1: Write the scrubber**

```tsx
// components/dashboard/seeding-scrubber.tsx
"use client";

import { useEffect, useState, useCallback } from "react";

interface Props {
  weeks: string[]; // ISO date strings, ascending
  currentWeek: string;
  onChange: (weekEnding: string) => void;
}

export function SeedingScrubber({ weeks, currentWeek, onChange }: Props) {
  const [playing, setPlaying] = useState(false);

  const reduced = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const idx = Math.max(0, weeks.indexOf(currentWeek));

  useEffect(() => {
    if (!playing || reduced) return;
    const handle = setInterval(() => {
      const next = idx + 1;
      if (next >= weeks.length) {
        setPlaying(false);
        return;
      }
      onChange(weeks[next]);
    }, 600);
    return () => clearInterval(handle);
  }, [playing, idx, weeks, onChange, reduced]);

  const onSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      onChange(weeks[next]);
    },
    [weeks, onChange],
  );

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>Week ending {currentWeek}</span>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full border border-border/40 bg-card/80 px-3 py-1 text-xs font-medium hover:bg-card"
          >
            {playing ? "Pause" : "Replay season"}
          </button>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(weeks.length - 1, 0)}
        step={1}
        value={idx}
        onChange={onSlider}
        className="w-full accent-canola"
        aria-label="Select week"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{weeks[0] ?? ""}</span>
        <span>{weeks[weeks.length - 1] ?? ""}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/seeding-scrubber.tsx
git commit -m "feat(seeding): week scrubber with replay + reduced-motion"
```

---

### Task B5: Legend

**Files:**
- Create: `components/dashboard/seeding-legend.tsx`

- [ ] **Step 1: Write the legend**

```tsx
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
          <path d="M3 11 C10 5 18 9 25 3" fill="none" stroke="#437a22" strokeWidth={3} strokeLinecap="round" />
        </svg>
        <span>Condition improving</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <svg width={28} height={14} viewBox="0 0 28 14" aria-hidden="true">
          <path d="M3 4 C10 9 18 6 25 11" fill="none" stroke="#d97706" strokeWidth={3} strokeLinecap="round" />
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
      <span className="h-2.5 w-6 rounded" style={{ background: swatch }} />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/seeding-legend.tsx
git commit -m "feat(seeding): map legend"
```

---

### Task B6: Seeding map (integration)

**Files:**
- Create: `components/dashboard/seeding-map.tsx`

- [ ] **Step 1: Write the map component**

```tsx
// components/dashboard/seeding-map.tsx
"use client";

import { useMemo, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { SeismographGlyph } from "@/components/dashboard/seeding-seismograph-glyph";
import { SeedingScrubber } from "@/components/dashboard/seeding-scrubber";
import { SeedingLegend } from "@/components/dashboard/seeding-legend";
import {
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";

interface Props {
  rows: SeismographRow[];
  commodity: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const INITIAL_VIEW = {
  longitude: -93.5,
  latitude: 40.5,
  zoom: 3.5,
};

export function SeedingMap({ rows, commodity }: Props) {
  const grouped = useMemo(() => groupByState(rows), [rows]);
  const states = Object.keys(grouped).sort();

  const allWeeks = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.week_ending);
    return [...set].sort();
  }, [rows]);

  const [currentWeek, setCurrentWeek] = useState(
    allWeeks[allWeeks.length - 1] ?? "",
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-2xl border border-border/40 bg-muted/20 text-sm text-muted-foreground">
        Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN not configured
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-3">
        <div className="relative h-[480px] overflow-hidden rounded-2xl border border-border/40">
          <Map
            initialViewState={INITIAL_VIEW}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            scrollZoom={false}
            dragPan={false}
            dragRotate={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            keyboard={false}
            attributionControl={false}
          >
            {states.map((stateCode) => {
              const stateRows = grouped[stateCode];
              const first = stateRows[0];
              if (!first) return null;
              return (
                <Marker
                  key={stateCode}
                  longitude={first.centroid_lng}
                  latitude={first.centroid_lat}
                  anchor="center"
                >
                  <SeismographGlyph
                    rows={stateRows}
                    commodity={commodity}
                    currentWeek={currentWeek}
                  />
                </Marker>
              );
            })}
          </Map>
        </div>
        <SeedingScrubber
          weeks={allWeeks}
          currentWeek={currentWeek}
          onChange={setCurrentWeek}
        />
      </div>
      <SeedingLegend />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/seeding-map.tsx
git commit -m "feat(seeding): integrate map + glyphs + scrubber + legend"
```

---

### Task B7: Seeding page (server)

**Files:**
- Create: `app/(dashboard)/seeding/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/(dashboard)/seeding/page.tsx
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { GlassCard } from "@/components/ui/glass-card";
import { SeedingMap } from "@/components/dashboard/seeding-map";
import { SeedingCanadaPlaceholder } from "@/components/dashboard/seeding-canada-placeholder";
import { SeedingTableFallback } from "@/components/dashboard/seeding-table-fallback";
import { getSeedingSeismograph } from "@/lib/queries/seeding-progress";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

const COMMODITIES = ["CORN", "SOYBEANS", "WHEAT", "BARLEY", "OATS"] as const;

interface PageProps {
  searchParams: Promise<{ crop?: string }>;
}

export default async function SeedingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const cropParam = (sp.crop ?? "CORN").toUpperCase();
  const commodity = (COMMODITIES as readonly string[]).includes(cropParam)
    ? cropParam
    : "CORN";

  const marketYear = new Date().getFullYear();

  const result = await safeQuery("seeding seismograph", () =>
    getSeedingSeismograph(commodity, marketYear),
  );
  const rows = result.data ?? [];
  const latestWeek = rows.length > 0
    ? rows
        .map((r) => r.week_ending)
        .sort()
        .at(-1) ?? ""
    : "";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <SectionBoundary>
        <SectionHeader
          title="Weekly Seeding Progress"
          subtitle={
            latestWeek
              ? `USDA NASS week ending ${latestWeek}. State data only for the US grain belt.`
              : "USDA NASS data not available for this market year."
          }
        >
          <CropSelect current={commodity} />
        </SectionHeader>
        <SeedingCanadaPlaceholder />
        <GlassCard elevation={2} hover={false}>
          <div className="p-5">
            {rows.length === 0 ? (
              <SectionStateCard
                title="No seeding data yet"
                message="USDA NASS releases new state-level data Mondays in season."
              />
            ) : (
              <>
                <SeedingMap rows={rows} commodity={titleCase(commodity)} />
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    View as table (accessible / reduced-motion)
                  </summary>
                  <div className="mt-3">
                    <SeedingTableFallback
                      rows={rows}
                      commodity={titleCase(commodity)}
                      weekEnding={latestWeek}
                    />
                  </div>
                </details>
              </>
            )}
          </div>
        </GlassCard>
      </SectionBoundary>
    </div>
  );
}

function CropSelect({ current }: { current: string }) {
  return (
    <form method="get" className="flex items-center gap-2">
      <label htmlFor="crop" className="text-xs font-medium text-muted-foreground">
        Showing
      </label>
      <select
        id="crop"
        name="crop"
        defaultValue={current}
        className="rounded-full border border-border/40 bg-card px-3 py-1.5 text-sm font-medium"
      >
        {COMMODITIES.map((c) => (
          <option key={c} value={c}>
            {titleCase(c)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-full border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Update
      </button>
    </form>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean build, `/seeding` route appears in the build output.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/seeding/page.tsx
git commit -m "feat(seeding): /seeding page composing map + placeholder + fallback"
```

---

### Task B8: Smoke-test in browser

**Files:** none — manual verification.

- [ ] **Step 1: Start the dev server via the preview tool**

Run: `preview_start` with `name: "Next.js dev"`
Expected: server starts on port 3001.

- [ ] **Step 2: Navigate and verify**

After logging in (auth required), open `/seeding`.

Expected:
- SectionHeader renders "Weekly Seeding Progress"
- Canada placeholder banner visible
- Map renders with ~15 SVG glyphs at correct US grain-belt positions
- Scrubber slides smoothly; replay button advances week by week
- Glyphs show condition arrows (up / down) per state
- "View as table" disclosure expands to the accessible table
- No console errors

- [ ] **Step 3: Verify mobile breakpoint**

Resize the preview to 375px width.
Expected:
- Layout collapses to a single column (map full-width, legend stacks below)
- Glyphs remain readable

- [ ] **Step 4: Stop the preview server**

- [ ] **Step 5: Commit any tweaks needed from smoke-test**

```bash
git add components/dashboard/seeding-map.tsx app/(dashboard)/seeding/page.tsx
git commit -m "fix(seeding): smoke-test tweaks"
```
(Skip if no tweaks needed.)

---

### Task B9: Optional nav link from /us

**Files:**
- Modify: `app/(dashboard)/us/page.tsx`

- [ ] **Step 1: Add a conditional link**

Open `app/(dashboard)/us/page.tsx`. Find the `SectionHeader` at line 25-28. Replace its closing `/>` and the next blank line with:

```tsx
        >
          {isPlantingSeason() && (
            <Link
              href="/seeding"
              className="text-xs font-medium text-canola hover:underline"
            >
              National seeding progress →
            </Link>
          )}
        </SectionHeader>
```

Then add at the bottom of the file (before any default exports):

```tsx
function isPlantingSeason(): boolean {
  const m = new Date().getMonth() + 1; // 1-based
  return m >= 4 && m <= 6;
}
```

Make sure `Link` is imported from `next/link` at the top.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/us/page.tsx
git commit -m "feat(seeding): link to /seeding from /us during planting season"
```

---

### Task B10: STATUS.md + lessons-learned (DoD per CLAUDE.md)

**Files:**
- Modify: `docs/plans/STATUS.md`

- [ ] **Step 1: Add the feature track entry**

Append to `docs/plans/STATUS.md` a new track entry following the existing format. Use the next available track number (read the file to find the highest) and the date `2026-04-28` (or current). Suggested entry:

```markdown
### Track NN — /seeding (Crop Pulse Seismograph map) — 2026-04-28
- Phase A (data): per-state USDA crop progress ingestion + us_state_centroids reference table + get_seeding_seismograph RPC + lib/queries/seeding-progress.ts
- Phase B (UI): /seeding route with Mapbox light-v11 + 15 SVG seismograph glyphs + week scrubber with reduced-motion fallback + a11y table view + Canada placeholder banner
- Design doc: docs/plans/2026-04-27-seeding-progress-map-design.md
- Plan: docs/plans/2026-04-27-seeding-progress-map-plan.md
- Cohesion section: adopts SectionHeader, SectionBoundary, GlassCard; v2/v3 evolution will follow /my-farm multi-section pattern per cohesion audit
```

- [ ] **Step 2: Commit**

```bash
git add docs/plans/STATUS.md
git commit -m "docs(seeding): record /seeding track in STATUS"
```

---

## Self-Review

**Spec coverage:**
- ✅ Architecture (server + client split): Tasks A4, A5, B7
- ✅ Seismograph glyph spec: Task B3
- ✅ Temporal scrubber: Task B4
- ✅ Data model (centroids + RPC): Tasks A1, A3
- ✅ Ingestion expansion: Task A2
- ✅ Cohesion section (SectionHeader, GlassCard, SectionBoundary reused): Task B7
- ✅ Phased rollout (v1 only in this plan): explicit
- ✅ Definition of Done (build, tests, mobile, reduced-motion, table fallback, freshness banner, Canada placeholder): Tasks A6, B2, B4, B7, B8, B10
- ⚠️ DoD item #5 (`prefers-reduced-motion`): handled in Task B4 scrubber. The scan-line on glyphs doesn't animate (it's static per scrubber position) — no extra reduced-motion handling needed.
- ⚠️ DoD item #6 (keyboard nav through state glyphs): Mapbox `<Marker>` is not keyboard-focusable by default. The table fallback in Task B2 is the keyboard/screen-reader path. Documented as the a11y answer.

**Placeholder scan:** No "TBD", "TODO", "implement later" found. All code blocks are complete.

**Type consistency:**
- `SeismographRow` shape consistent across A4, A5, B3, B6, B7.
- `groupByState` signature consistent in A4 (definition) and B6 (usage).
- `conditionStrokeColor` signature consistent in A4 (definition) and B3 (usage).
- `currentWeek: string` (ISO date) — consistent in B3, B4, B6.
- `weeks: string[]` ascending — consistent in B4, B6.

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-27-seeding-progress-map-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good when you want me to drive task-by-task with cleanup verification.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints. Good when you want to watch and steer in real time.

Which approach?
