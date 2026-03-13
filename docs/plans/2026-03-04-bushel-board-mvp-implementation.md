# Bushel Board MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production Next.js + Supabase grain dashboard that auto-imports CGC weekly data and displays it to Canadian prairie farmers.

**Architecture:** Hybrid approach — Next.js App Router with Server Components for fast page loads, Supabase client-side for auth (magic links), Supabase Edge Functions for scheduled CGC data imports. shadcn/ui + Tailwind CSS customized with the existing wheat/canola design palette.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL, Auth, Edge Functions, pg_cron), Tailwind CSS, shadcn/ui, Recharts (React-native charting), Vercel deployment.

**Design Doc:** `docs/plans/2026-03-04-bushel-board-mvp-design.md`

**Existing Prototype:** `../Bushel Board/` — vanilla JS dashboard with static data. Use as visual reference for colors, animations, layout patterns. Do NOT copy code directly.

**CGC CSV Reference:** `data/CGC Weekly/gsw-shg-en.csv` — 118,378 rows, 29 weeks (crop year 2025-26), columns: `Crop Year,Grain Week,Week Ending Date,worksheet,metric,period,grain,grade,Region,Ktonnes`

---

## Agent Swarm Architecture

This plan is designed for parallel execution by multiple agents. Tasks are grouped into independent workstreams that can run concurrently.

**Workstream A — Project Foundation (must complete first)**
Tasks 1-2: Next.js scaffold, Supabase init, Tailwind config

**Workstream B — Database & Data Pipeline (after A)**
Tasks 3-6: Schema, views, Edge Functions, backfill script

**Workstream C — Auth (after A)**
Tasks 7-8: Supabase Auth setup, login/callback pages

**Workstream D — Dashboard UI (after A, needs B for real data)**
Tasks 9-15: Layout, components, pages

**Dependency graph:**
```
A (Tasks 1-2) ──→ B (Tasks 3-6)
              ──→ C (Tasks 7-8)
              ──→ D (Tasks 9-15) [can start with mock data, wire to real after B]
```

---

## Task 1: Scaffold Next.js Project

**Files:**
- Create: `c:/Users/kyle/Agriculture/bushel-board-app/` (entire project)

**Step 1: Create Next.js app**

Run:
```bash
cd "c:/Users/kyle/Agriculture"
npx create-next-app@latest bushel-board-app --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack
```

Expected: New directory with Next.js 15 + TypeScript + Tailwind + App Router

**Step 2: Install dependencies**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npm install @supabase/supabase-js @supabase/ssr recharts lucide-react clsx tailwind-merge class-variance-authority
npm install -D @types/node
```

**Step 3: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

Then add core components:
```bash
npx shadcn@latest add button card table badge tabs separator input label skeleton
```

**Step 4: Set up project structure**

Create these directories:
```bash
mkdir -p app/\(dashboard\) app/\(dashboard\)/grain/\[slug\] app/\(dashboard\)/grains app/\(auth\)/login app/\(auth\)/callback
mkdir -p components/ui components/dashboard components/layout
mkdir -p lib/supabase lib/queries lib/utils
mkdir -p supabase/migrations supabase/functions/cgc-weekly-import supabase/functions/cgc-integrity-check supabase/functions/cgc-backfill
```

**Step 5: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 15 project with Supabase, shadcn/ui, Recharts"
```

---

## Task 2: Configure Design System (Tailwind + Fonts)

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Step 1: Configure Tailwind with wheat palette**

Replace `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wheat: {
          50: "#f5f3ee",
          100: "#ebe7dc",
          200: "#d7cfb9",
          300: "#c3b796",
          400: "#af9f73",
          500: "#9b8750",
          600: "#7c6c40",
          700: "#5d5130",
          800: "#3e3620",
          900: "#2a261e",
        },
        canola: {
          DEFAULT: "#c17f24",
          light: "#d4983e",
          dark: "#a06a1c",
          50: "#fdf6eb",
          100: "#faecd7",
          500: "#c17f24",
          600: "#a06a1c",
          700: "#805515",
        },
        prairie: {
          DEFAULT: "#437a22",
          light: "#5a9e30",
          dark: "#2e5517",
        },
        province: {
          ab: "#2e6b9e",
          sk: "#6d9e3a",
          mb: "#b37d24",
        },
        error: "#b33a3a",
      },
      fontFamily: {
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      animation: {
        "count-up": "countUp 800ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fadeIn 480ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slideUp 480ms cubic-bezier(0.16, 1, 0.3, 1)",
        ticker: "ticker 50s linear infinite",
      },
      keyframes: {
        countUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

**Step 2: Set up global CSS**

Replace `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 40 18% 95%;
    --foreground: 40 16% 13%;
    --card: 40 18% 98%;
    --card-foreground: 40 16% 13%;
    --popover: 40 18% 98%;
    --popover-foreground: 40 16% 13%;
    --primary: 33 69% 45%;
    --primary-foreground: 40 18% 98%;
    --secondary: 40 18% 90%;
    --secondary-foreground: 40 16% 13%;
    --muted: 40 10% 88%;
    --muted-foreground: 40 10% 45%;
    --accent: 40 18% 90%;
    --accent-foreground: 40 16% 13%;
    --destructive: 0 60% 46%;
    --destructive-foreground: 0 0% 100%;
    --border: 40 12% 85%;
    --input: 40 12% 85%;
    --ring: 33 69% 45%;
    --radius: 0.625rem;
  }

  .dark {
    --background: 40 12% 10%;
    --foreground: 40 14% 90%;
    --card: 40 10% 14%;
    --card-foreground: 40 14% 90%;
    --popover: 40 10% 14%;
    --popover-foreground: 40 14% 90%;
    --primary: 33 65% 53%;
    --primary-foreground: 40 12% 10%;
    --secondary: 40 8% 20%;
    --secondary-foreground: 40 14% 90%;
    --muted: 40 6% 22%;
    --muted-foreground: 40 8% 55%;
    --accent: 40 8% 20%;
    --accent-foreground: 40 14% 90%;
    --destructive: 0 55% 50%;
    --destructive-foreground: 0 0% 100%;
    --border: 40 6% 22%;
    --input: 40 6% 22%;
    --ring: 33 65% 53%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-body antialiased;
  }
  h1, h2, h3 {
    @apply font-display;
  }
}

/* Tabular numbers for all data values */
[data-value],
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Step 3: Configure root layout with fonts**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bushel Board — Prairie Grain Market Intelligence",
  description:
    "Real-time grain statistics, market data, and insights for Canadian prairie farmers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
```

**Step 4: Install tailwindcss-animate**

Run:
```bash
npm install tailwindcss-animate
```

**Step 5: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure wheat palette design system with DM Sans + Fraunces fonts"
```

---

## Task 3: Supabase Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Modify: `supabase/config.toml` (if needed)

**Step 1: Initialize Supabase locally**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx supabase init
```

**Step 2: Write the migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- CGC observations: raw grain statistics in long format
CREATE TABLE cgc_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  week_ending_date date NOT NULL,
  worksheet text NOT NULL,
  metric text NOT NULL,
  period text NOT NULL,
  grain text NOT NULL,
  grade text DEFAULT '',
  region text NOT NULL,
  ktonnes numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(crop_year, grain_week, worksheet, metric, period, grain, grade, region)
);

-- Performance indexes
CREATE INDEX idx_cgc_obs_grain_week ON cgc_observations(grain, grain_week);
CREATE INDEX idx_cgc_obs_worksheet_metric ON cgc_observations(worksheet, metric);
CREATE INDEX idx_cgc_obs_crop_year ON cgc_observations(crop_year);
CREATE INDEX idx_cgc_obs_period ON cgc_observations(period);
CREATE INDEX idx_cgc_obs_region ON cgc_observations(region);

-- Import audit log
CREATE TABLE cgc_imports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_at timestamptz DEFAULT now(),
  crop_year text,
  grain_week int,
  source_file text,
  rows_inserted int DEFAULT 0,
  rows_skipped int DEFAULT 0,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial', 'integrity_check')),
  error_message text
);

-- Grain lookup for display ordering and slugs
CREATE TABLE grains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  category text DEFAULT 'Canadian' CHECK (category IN ('Canadian', 'Imported', 'US')),
  display_order int DEFAULT 999
);

-- Seed grain lookup with the 16 primary Canadian grains
INSERT INTO grains (name, slug, category, display_order) VALUES
  ('Canola', 'canola', 'Canadian', 1),
  ('Wheat', 'wheat', 'Canadian', 2),
  ('Amber Durum', 'amber-durum', 'Canadian', 3),
  ('Barley', 'barley', 'Canadian', 4),
  ('Oats', 'oats', 'Canadian', 5),
  ('Peas', 'peas', 'Canadian', 6),
  ('Lentils', 'lentils', 'Canadian', 7),
  ('Flaxseed', 'flaxseed', 'Canadian', 8),
  ('Soybeans', 'soybeans', 'Canadian', 9),
  ('Corn', 'corn', 'Canadian', 10),
  ('Rye', 'rye', 'Canadian', 11),
  ('Mustard Seed', 'mustard-seed', 'Canadian', 12),
  ('Canaryseed', 'canaryseed', 'Canadian', 13),
  ('Chick Peas', 'chick-peas', 'Canadian', 14),
  ('Sunflower', 'sunflower', 'Canadian', 15),
  ('Beans', 'beans', 'Canadian', 16);

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text,
  province text CHECK (province IN ('AB', 'SK', 'MB', 'BC', 'ON', NULL)),
  nearest_town text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Row Level Security
ALTER TABLE cgc_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgc_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE grains ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- CGC data is readable by everyone (public dashboard)
CREATE POLICY "CGC observations are publicly readable"
  ON cgc_observations FOR SELECT
  USING (true);

-- Only service role can insert/update CGC data (Edge Functions)
CREATE POLICY "Only service role can modify CGC observations"
  ON cgc_observations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update CGC observations"
  ON cgc_observations FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete CGC observations"
  ON cgc_observations FOR DELETE
  USING (auth.role() = 'service_role');

-- Import log is publicly readable (for freshness indicator)
CREATE POLICY "CGC imports are publicly readable"
  ON cgc_imports FOR SELECT
  USING (true);

CREATE POLICY "Only service role can modify CGC imports"
  ON cgc_imports FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Grains lookup is publicly readable
CREATE POLICY "Grains are publicly readable"
  ON grains FOR SELECT
  USING (true);

-- Profiles: users can read/update their own
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

**Step 3: Push migration to Supabase**

Run:
```bash
npx supabase db push --linked
```

Or if linking is needed first:
```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

The user will need to provide their Supabase project ref. Expected: Migration applies successfully.

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with CGC observations, grains, profiles, RLS"
```

---

## Task 4: Dashboard SQL Views

**Files:**
- Create: `supabase/migrations/002_dashboard_views.sql`

**Step 1: Create dashboard views**

Create `supabase/migrations/002_dashboard_views.sql`:

```sql
-- Primary elevator deliveries by grain, week, and province
CREATE OR REPLACE VIEW v_grain_deliveries AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  period,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Primary'
  AND metric = 'Deliveries';

-- Primary elevator shipments by grain, week, and province
CREATE OR REPLACE VIEW v_grain_shipments AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  period,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Primary'
  AND metric = 'Shipments';

-- Summary stocks by grain and location type
CREATE OR REPLACE VIEW v_grain_stocks AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  period,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Summary'
  AND metric = 'Stocks';

-- Terminal exports by port
CREATE OR REPLACE VIEW v_terminal_exports AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Terminal Exports'
  AND period = 'Current Week';

-- Shipment distribution (where grain goes: Pacific, Thunder Bay, domestic, etc.)
CREATE OR REPLACE VIEW v_shipment_distribution AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  worksheet,
  metric,
  period,
  region,
  ktonnes
FROM cgc_observations
WHERE worksheet LIKE '%Shipment Distribution%';

-- Latest import info (for freshness indicator)
CREATE OR REPLACE VIEW v_latest_import AS
SELECT
  grain_week,
  crop_year,
  imported_at,
  rows_inserted,
  status
FROM cgc_imports
WHERE status = 'success'
ORDER BY imported_at DESC
LIMIT 1;

-- Grain overview: latest week summary per grain (for all-grains table)
-- Gets crop year deliveries, current week deliveries, and current stocks for each grain
CREATE OR REPLACE VIEW v_grain_overview AS
WITH latest_week AS (
  SELECT MAX(grain_week) AS max_week, crop_year
  FROM cgc_observations
  GROUP BY crop_year
  ORDER BY crop_year DESC
  LIMIT 1
),
cy_deliveries AS (
  SELECT grain, SUM(ktonnes) AS cy_deliveries_kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Crop Year'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
cw_deliveries AS (
  SELECT grain, SUM(ktonnes) AS cw_deliveries_kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Current Week'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
prev_deliveries AS (
  SELECT grain, SUM(ktonnes) AS prev_deliveries_kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Current Week'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week - 1
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
)
SELECT
  g.name AS grain,
  g.slug,
  g.display_order,
  COALESCE(cy.cy_deliveries_kt, 0) AS cy_deliveries_kt,
  COALESCE(cw.cw_deliveries_kt, 0) AS cw_deliveries_kt,
  COALESCE(prev.prev_deliveries_kt, 0) AS prev_deliveries_kt,
  CASE
    WHEN COALESCE(prev.prev_deliveries_kt, 0) > 0
    THEN ROUND(((cw.cw_deliveries_kt - prev.prev_deliveries_kt) / prev.prev_deliveries_kt * 100)::numeric, 1)
    ELSE 0
  END AS wow_pct_change
FROM grains g
LEFT JOIN cy_deliveries cy ON cy.grain = g.name
LEFT JOIN cw_deliveries cw ON cw.grain = g.name
LEFT JOIN prev_deliveries prev ON prev.grain = g.name
WHERE g.category = 'Canadian'
ORDER BY g.display_order;
```

**Step 2: Push migration**

Run:
```bash
npx supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/002_dashboard_views.sql
git commit -m "feat: add dashboard SQL views for deliveries, stocks, exports, grain overview"
```

---

## Task 5: Supabase Client Configuration

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts` (root)
- Create: `.env.local` (template)

**Step 1: Create environment template**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The user must create `.env.local` with their actual values.

**Step 2: Browser client**

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 3: Server client**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

**Step 4: Auth middleware**

Create `lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes: redirect to login if not authenticated
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

Create `middleware.ts` (project root):

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Step 5: Add .env.local to .gitignore**

Verify `.gitignore` contains `.env*.local`. Add if missing.

**Step 6: Commit**

```bash
git add lib/supabase/ middleware.ts .env.local.example
git commit -m "feat: configure Supabase client (browser, server, middleware) with auth guard"
```

---

## Task 6: CGC Backfill Script (Local)

**Files:**
- Create: `scripts/cgc-backfill.ts`
- Create: `scripts/parse-cgc-csv.ts` (shared parser)

This is a one-time local script that loads the existing 11.5MB CSV into Supabase. Not an Edge Function — runs locally without time limits.

**Step 1: Create CSV parser utility**

Create `scripts/parse-cgc-csv.ts`:

```typescript
export interface CgcRow {
  crop_year: string;
  grain_week: number;
  week_ending_date: string; // ISO date
  worksheet: string;
  metric: string;
  period: string;
  grain: string;
  grade: string;
  region: string;
  ktonnes: number;
}

/**
 * Parse a CGC CSV string into typed rows.
 * CGC date format is DD/MM/YYYY — convert to YYYY-MM-DD for Postgres.
 */
export function parseCgcCsv(csvText: string): CgcRow[] {
  const lines = csvText.trim().split("\n");
  const header = lines[0]; // Skip header
  const rows: CgcRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split on comma, handling potential edge cases
    const parts = line.split(",");
    if (parts.length < 10) continue;

    const [cropYear, grainWeek, dateStr, worksheet, metric, period, grain, grade, region, ktonnes] = parts;

    // Convert DD/MM/YYYY to YYYY-MM-DD
    const dateParts = dateStr.split("/");
    const isoDate = dateParts.length === 3
      ? `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`
      : dateStr;

    rows.push({
      crop_year: cropYear.trim(),
      grain_week: parseInt(grainWeek.trim(), 10),
      week_ending_date: isoDate,
      worksheet: worksheet.trim(),
      metric: metric.trim(),
      period: period.trim(),
      grain: grain.trim(),
      grade: (grade || "").trim(),
      region: region.trim(),
      ktonnes: parseFloat(ktonnes.trim()) || 0,
    });
  }

  return rows;
}
```

**Step 2: Create backfill script**

Create `scripts/cgc-backfill.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCgcCsv } from "./parse-cgc-csv";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function backfill() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Read the large CSV from the prototype directory
  const csvPath = resolve(process.cwd(), "data/CGC Weekly/gsw-shg-en.csv");
  console.log(`Reading CSV from: ${csvPath}`);
  const csvText = readFileSync(csvPath, "utf-8");

  const rows = parseCgcCsv(csvText);
  console.log(`Parsed ${rows.length} rows`);

  // Insert in batches of 1000
  const BATCH_SIZE = 1000;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from("cgc_observations")
      .upsert(batch, {
        onConflict: "crop_year,grain_week,worksheet,metric,period,grain,grade,region",
        ignoreDuplicates: true,
      });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE)} error:`, error.message);
      skipped += batch.length;
    } else {
      inserted += batch.length;
    }

    if ((i / BATCH_SIZE) % 10 === 0) {
      console.log(`Progress: ${i}/${rows.length} rows processed`);
    }
  }

  // Log the import
  await supabase.from("cgc_imports").insert({
    crop_year: "2025-2026",
    grain_week: 29,
    source_file: "gsw-shg-en.csv (backfill)",
    rows_inserted: inserted,
    rows_skipped: skipped,
    status: skipped > 0 ? "partial" : "success",
  });

  console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}`);
}

backfill().catch(console.error);
```

**Step 3: Add run script to package.json**

Add to `package.json` scripts:

```json
"scripts": {
  "backfill": "npx tsx scripts/cgc-backfill.ts"
}
```

Install tsx:
```bash
npm install -D tsx
```

**Step 4: Run the backfill**

Run:
```bash
npm run backfill
```

Expected: ~118,000 rows inserted into Supabase. Output shows progress and final count.

**Step 5: Verify data in Supabase**

Run (via Supabase SQL editor or local):
```sql
SELECT COUNT(*) FROM cgc_observations;
SELECT grain, COUNT(*) FROM cgc_observations GROUP BY grain ORDER BY grain;
SELECT * FROM v_grain_overview;
```

**Step 6: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: add CGC CSV parser and backfill script, load 118k rows into Supabase"
```

---

## Task 7: Supabase Edge Function — Weekly Import

**Files:**
- Create: `supabase/functions/cgc-weekly-import/index.ts`

**Step 1: Write the Edge Function**

Create `supabase/functions/cgc-weekly-import/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://deno.land/std@0.224.0/csv/parse.ts";

const CGC_BASE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate current grain week
    // CGC crop year starts Aug 1. Week 1 ends on the first Wednesday after Aug 1.
    // For now, fetch the latest available week by trying current week and falling back.
    const body = await req.json().catch(() => ({}));
    const targetWeek = body.week || getCurrentGrainWeek();
    const cropYear = body.crop_year || getCurrentCropYear();

    console.log(`Fetching CGC data for week ${targetWeek}, crop year ${cropYear}`);

    // Try to fetch the individual week CSV
    // URL pattern needs to be confirmed against actual CGC site
    const csvUrl = `${CGC_BASE_URL}gsw-shg-${targetWeek}-en.csv`;
    const response = await fetch(csvUrl);

    if (!response.ok) {
      // Log failure and return
      await supabase.from("cgc_imports").insert({
        crop_year: cropYear,
        grain_week: targetWeek,
        source_file: `gsw-shg-${targetWeek}-en.csv`,
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: `HTTP ${response.status}: ${response.statusText}`,
      });

      return new Response(
        JSON.stringify({ error: `Failed to fetch week ${targetWeek}`, status: response.status }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const csvText = await response.text();
    const rows = parseCgcCsv(csvText);

    // Batch insert
    let inserted = 0;
    let skipped = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("cgc_observations")
        .upsert(batch, {
          onConflict: "crop_year,grain_week,worksheet,metric,period,grain,grade,region",
          ignoreDuplicates: true,
        });

      if (error) {
        console.error(`Batch error:`, error.message);
        skipped += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    // Log success
    await supabase.from("cgc_imports").insert({
      crop_year: cropYear,
      grain_week: targetWeek,
      source_file: `gsw-shg-${targetWeek}-en.csv`,
      rows_inserted: inserted,
      rows_skipped: skipped,
      status: skipped > 0 ? "partial" : "success",
    });

    return new Response(
      JSON.stringify({ week: targetWeek, inserted, skipped }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// --- Helpers ---

interface CgcRow {
  crop_year: string;
  grain_week: number;
  week_ending_date: string;
  worksheet: string;
  metric: string;
  period: string;
  grain: string;
  grade: string;
  region: string;
  ktonnes: number;
}

function parseCgcCsv(csvText: string): CgcRow[] {
  const lines = csvText.trim().split("\n");
  const rows: CgcRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 10) continue;

    const [cropYear, grainWeek, dateStr, worksheet, metric, period, grain, grade, region, ktonnes] = parts;

    const dateParts = dateStr.split("/");
    const isoDate = dateParts.length === 3
      ? `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`
      : dateStr;

    rows.push({
      crop_year: cropYear.trim(),
      grain_week: parseInt(grainWeek.trim(), 10),
      week_ending_date: isoDate,
      worksheet: worksheet.trim(),
      metric: metric.trim(),
      period: period.trim(),
      grain: grain.trim(),
      grade: (grade || "").trim(),
      region: region.trim(),
      ktonnes: parseFloat(ktonnes.trim()) || 0,
    });
  }

  return rows;
}

function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Crop year starts Aug 1
  if (month >= 7) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Crop year starts Aug 1
  const cropYearStart = month >= 7
    ? new Date(year, 7, 1)
    : new Date(year - 1, 7, 1);
  const diffMs = now.getTime() - cropYearStart.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}
```

**Step 2: Deploy Edge Function**

Run:
```bash
npx supabase functions deploy cgc-weekly-import
```

**Step 3: Set up pg_cron schedule (via Supabase Dashboard SQL Editor)**

```sql
-- Schedule weekly import: every Thursday at 8pm UTC (1pm MST)
SELECT cron.schedule(
  'cgc-weekly-import',
  '0 20 * * 4',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/cgc-weekly-import',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Note: pg_cron + pg_net setup may vary depending on Supabase plan. The user may need to enable these extensions and store secrets in the vault. This should be verified during implementation.

**Step 4: Test manually**

Run:
```bash
npx supabase functions invoke cgc-weekly-import --body '{"week": 29, "crop_year": "2025-2026"}'
```

Expected: Returns JSON with inserted/skipped counts.

**Step 5: Commit**

```bash
git add supabase/functions/cgc-weekly-import/
git commit -m "feat: add CGC weekly import Edge Function with CSV parser"
```

---

## Task 8: Auth — Login and Callback Pages

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/callback/route.ts`

**Step 1: Create login page with magic link**

Create `app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-wheat-50 dark:bg-wheat-900 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-display text-canola">
            Bushel Board
          </CardTitle>
          <CardDescription>
            Prairie grain market intelligence for Canadian farmers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-2">
              <p className="text-prairie font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="farmer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-error">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-canola hover:bg-canola-dark text-white"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Magic Link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Create auth callback route**

Create `app/(auth)/callback/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

**Step 3: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: add magic link login page and auth callback route"
```

---

## Task 9: Dashboard Layout Shell

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `components/layout/nav.tsx`
- Create: `components/layout/mobile-nav.tsx`
- Create: `components/layout/theme-toggle.tsx`
- Create: `components/layout/cgc-freshness.tsx`

**Step 1: Create theme toggle**

Create `components/layout/theme-toggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
```

**Step 2: Create navigation**

Create `components/layout/nav.tsx`:

```tsx
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";
import { CgcFreshness } from "./cgc-freshness";

const grainLinks = [
  { name: "Canola", slug: "canola" },
  { name: "Wheat", slug: "wheat" },
  { name: "Amber Durum", slug: "amber-durum" },
  { name: "Barley", slug: "barley" },
  { name: "Oats", slug: "oats" },
  { name: "Peas", slug: "peas" },
  { name: "Lentils", slug: "lentils" },
  { name: "Flaxseed", slug: "flaxseed" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-lg text-canola font-semibold">
            Bushel Board
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              Overview
            </Link>
            <Link
              href="/grains"
              className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              All Grains
            </Link>
            {grainLinks.slice(0, 3).map((g) => (
              <Link
                key={g.slug}
                href={`/grain/${g.slug}`}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
              >
                {g.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <CgcFreshness />
          <ThemeToggle />
          <MobileNav grainLinks={grainLinks} />
        </div>
      </div>
    </header>
  );
}
```

**Step 3: Create mobile nav**

Create `components/layout/mobile-nav.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileNavProps {
  grainLinks: { name: string; slug: string }[];
}

export function MobileNav({ grainLinks }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Menu">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      {open && (
        <div className="absolute top-14 left-0 right-0 border-b border-border bg-background p-4 animate-slide-up">
          <nav className="flex flex-col gap-1">
            <Link href="/" onClick={() => setOpen(false)} className="px-3 py-2 rounded-md hover:bg-accent">
              Overview
            </Link>
            <Link href="/grains" onClick={() => setOpen(false)} className="px-3 py-2 rounded-md hover:bg-accent">
              All Grains
            </Link>
            <div className="h-px bg-border my-2" />
            {grainLinks.map((g) => (
              <Link
                key={g.slug}
                href={`/grain/${g.slug}`}
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-md hover:bg-accent text-sm"
              >
                {g.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Create CGC freshness indicator**

Create `components/layout/cgc-freshness.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";

export async function CgcFreshness() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cgc_imports")
    .select("grain_week, crop_year, imported_at")
    .eq("status", "success")
    .order("imported_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted" />
        No data
      </div>
    );
  }

  const importDate = new Date(data.imported_at);
  const daysSince = Math.floor((Date.now() - importDate.getTime()) / 86400000);
  const isFresh = daysSince <= 7;

  // Calculate next Thursday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
  const nextThursday = new Date(now);
  nextThursday.setDate(now.getDate() + daysUntilThursday);

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`h-2 w-2 rounded-full ${isFresh ? "bg-prairie animate-pulse" : "bg-canola"}`}
      />
      CGC Wk {data.grain_week} · {data.crop_year} · Next: Thu{" "}
      {nextThursday.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
    </div>
  );
}
```

**Step 5: Create dashboard layout**

Create `app/(dashboard)/layout.tsx`:

```tsx
import { Nav } from "@/components/layout/nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add app/\(dashboard\)/layout.tsx components/layout/
git commit -m "feat: add dashboard layout with nav, mobile nav, theme toggle, CGC freshness"
```

---

## Task 10: Data Query Layer

**Files:**
- Create: `lib/queries/grains.ts`
- Create: `lib/queries/observations.ts`
- Create: `lib/utils/format.ts`
- Create: `lib/utils/grain-colors.ts`

**Step 1: Create grain color mapping**

Create `lib/utils/grain-colors.ts`:

```typescript
export const grainColors: Record<string, string> = {
  Canola: "#c17f24",
  Wheat: "#2e6b9e",
  "Amber Durum": "#b37d24",
  Barley: "#6d9e3a",
  Oats: "#8b7355",
  Peas: "#5a9e30",
  Lentils: "#b33a3a",
  Flaxseed: "#7a5c3e",
  Soybeans: "#4a7c59",
  Corn: "#d4a843",
  Rye: "#6b5b3e",
  "Mustard Seed": "#c9a825",
  Canaryseed: "#a89560",
  "Chick Peas": "#9e7a3a",
  Sunflower: "#d4983e",
  Beans: "#7a3e3e",
};
```

**Step 2: Create number/date formatters**

Create `lib/utils/format.ts`:

```typescript
/**
 * Format kilotonne value: 1234.5 → "1,234.5 kt"
 */
export function fmtKt(value: number, decimals = 1): string {
  return `${value.toLocaleString("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} kt`;
}

/**
 * Format percentage: 12.5 → "+12.5%"
 */
export function fmtPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format CGC date: "2026-02-22" → "Feb 22"
 */
export function fmtWeekDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
```

**Step 3: Create grain queries**

Create `lib/queries/grains.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";

export async function getGrainOverview() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_grain_overview")
    .select("*")
    .order("display_order");

  if (error) throw error;
  return data;
}

export async function getGrainBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grains")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) throw error;
  return data;
}

export async function getGrainList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grains")
    .select("name, slug, display_order")
    .eq("category", "Canadian")
    .order("display_order");

  if (error) throw error;
  return data;
}
```

**Step 4: Create observation queries**

Create `lib/queries/observations.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";

const PRAIRIE_PROVINCES = ["Alberta", "Saskatchewan", "Manitoba"];

/**
 * Get weekly delivery time series for a grain (current crop year).
 * Returns data for each province + total.
 */
export async function getDeliveryTimeSeries(grainName: string, cropYear?: string) {
  const supabase = await createClient();

  // Get latest crop year if not specified
  const year = cropYear || await getLatestCropYear(supabase);

  const { data, error } = await supabase
    .from("cgc_observations")
    .select("grain_week, week_ending_date, region, ktonnes")
    .eq("worksheet", "Primary")
    .eq("metric", "Deliveries")
    .eq("period", "Current Week")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .in("region", PRAIRIE_PROVINCES)
    .order("grain_week");

  if (error) throw error;
  return data;
}

/**
 * Get weekly shipment time series for a grain.
 */
export async function getShipmentTimeSeries(grainName: string, cropYear?: string) {
  const supabase = await createClient();
  const year = cropYear || await getLatestCropYear(supabase);

  const { data, error } = await supabase
    .from("cgc_observations")
    .select("grain_week, week_ending_date, region, ktonnes")
    .eq("worksheet", "Primary")
    .eq("metric", "Shipments")
    .eq("period", "Current Week")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .in("region", PRAIRIE_PROVINCES)
    .order("grain_week");

  if (error) throw error;
  return data;
}

/**
 * Get current stocks breakdown by region for a grain.
 */
export async function getStocksBreakdown(grainName: string) {
  const supabase = await createClient();
  const year = await getLatestCropYear(supabase);
  const week = await getLatestWeek(supabase, year);

  const { data, error } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes, worksheet")
    .eq("metric", "Stocks")
    .eq("period", "Current Week")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .eq("grain_week", week);

  if (error) throw error;
  return data;
}

/**
 * Get provincial deliveries (crop year total) for a grain.
 */
export async function getProvincialDeliveries(grainName: string) {
  const supabase = await createClient();
  const year = await getLatestCropYear(supabase);
  const week = await getLatestWeek(supabase, year);

  const { data, error } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes")
    .eq("worksheet", "Primary")
    .eq("metric", "Deliveries")
    .eq("period", "Crop Year")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .eq("grain_week", week)
    .in("region", PRAIRIE_PROVINCES);

  if (error) throw error;
  return data;
}

/**
 * Get shipment distribution (where grain went: Pacific, Thunder Bay, etc.)
 */
export async function getShipmentDistribution(grainName: string) {
  const supabase = await createClient();
  const year = await getLatestCropYear(supabase);
  const week = await getLatestWeek(supabase, year);

  const { data, error } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes")
    .like("worksheet", "%Shipment Distribution%")
    .eq("period", "Crop Year")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .eq("grain_week", week);

  if (error) throw error;
  return data;
}

// --- Helpers ---

async function getLatestCropYear(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("cgc_observations")
    .select("crop_year")
    .order("crop_year", { ascending: false })
    .limit(1)
    .single();
  return data?.crop_year || "2025-2026";
}

async function getLatestWeek(supabase: any, cropYear: string): Promise<number> {
  const { data } = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();
  return data?.grain_week || 1;
}
```

**Step 5: Commit**

```bash
git add lib/queries/ lib/utils/
git commit -m "feat: add typed Supabase query layer and formatting utilities"
```

---

## Task 11: Dashboard Overview Page

**Files:**
- Create: `app/(dashboard)/page.tsx`
- Create: `components/dashboard/pipeline-card.tsx`
- Create: `components/dashboard/grain-table.tsx`

**Step 1: Create pipeline card component**

Create `components/dashboard/pipeline-card.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtKt, fmtPct } from "@/lib/utils/format";

interface PipelineCardProps {
  grain: string;
  slug: string;
  cyDeliveries: number;
  cwDeliveries: number;
  wowChange: number;
}

export function PipelineCard({
  grain,
  slug,
  cyDeliveries,
  cwDeliveries,
  wowChange,
}: PipelineCardProps) {
  const isPositive = wowChange >= 0;

  return (
    <Link href={`/grain/${slug}`}>
      <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:border-canola/30 cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-body font-medium flex items-center justify-between">
            {grain}
            <Badge
              variant="secondary"
              className={isPositive ? "text-prairie" : "text-error"}
            >
              {fmtPct(wowChange)} WoW
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Crop Year Deliveries</span>
            <span className="tabular-nums font-medium">{fmtKt(cyDeliveries, 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">This Week</span>
            <span className="tabular-nums font-medium">{fmtKt(cwDeliveries)}</span>
          </div>
          {/* Progress bar showing relative delivery volume */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-canola transition-all duration-700"
              style={{ width: `${Math.min((cyDeliveries / 20000) * 100, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Create grain table component**

Create `components/dashboard/grain-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtKt, fmtPct } from "@/lib/utils/format";

interface GrainRow {
  grain: string;
  slug: string;
  display_order: number;
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  prev_deliveries_kt: number;
  wow_pct_change: number;
}

type SortKey = "grain" | "cy_deliveries_kt" | "cw_deliveries_kt" | "wow_pct_change";

export function GrainTable({ data }: { data: GrainRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("cy_deliveries_kt");
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "string" && typeof bv === "string") {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u25b2" : " \u25bc") : "";

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer" onClick={() => handleSort("grain")}>
              Grain{arrow("grain")}
            </TableHead>
            <TableHead className="text-right cursor-pointer" onClick={() => handleSort("cy_deliveries_kt")}>
              CY Deliveries{arrow("cy_deliveries_kt")}
            </TableHead>
            <TableHead className="text-right cursor-pointer" onClick={() => handleSort("cw_deliveries_kt")}>
              This Week{arrow("cw_deliveries_kt")}
            </TableHead>
            <TableHead className="text-right cursor-pointer" onClick={() => handleSort("wow_pct_change")}>
              WoW{arrow("wow_pct_change")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.slug} className="cursor-pointer hover:bg-accent/50">
              <TableCell>
                <Link href={`/grain/${row.slug}`} className="font-medium hover:text-canola">
                  {row.grain}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtKt(row.cy_deliveries_kt, 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtKt(row.cw_deliveries_kt)}
              </TableCell>
              <TableCell className={`text-right tabular-nums ${row.wow_pct_change >= 0 ? "text-prairie" : "text-error"}`}>
                {fmtPct(row.wow_pct_change)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 3: Create overview page**

Create `app/(dashboard)/page.tsx`:

```tsx
import { getGrainOverview } from "@/lib/queries/grains";
import { PipelineCard } from "@/components/dashboard/pipeline-card";
import { GrainTable } from "@/components/dashboard/grain-table";

export default async function DashboardPage() {
  const grains = await getGrainOverview();

  // Top 4 grains for pipeline cards
  const topGrains = grains.slice(0, 4);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-semibold">Supply Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crop year 2025-26 · Western Canada primary elevator activity
        </p>
      </div>

      {/* Pipeline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topGrains.map((g) => (
          <PipelineCard
            key={g.slug}
            grain={g.grain}
            slug={g.slug}
            cyDeliveries={g.cy_deliveries_kt}
            cwDeliveries={g.cw_deliveries_kt}
            wowChange={g.wow_pct_change}
          />
        ))}
      </div>

      {/* All Grains Table */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4">All Grains</h2>
        <GrainTable data={grains} />
      </div>
    </div>
  );
}
```

**Step 4: Verify build and check page renders**

Run:
```bash
npm run dev
```

Visit `http://localhost:3000` — should see pipeline cards and grain table with real data from Supabase.

**Step 5: Commit**

```bash
git add app/\(dashboard\)/page.tsx components/dashboard/
git commit -m "feat: add dashboard overview page with pipeline cards and sortable grain table"
```

---

## Task 12: Grain Detail Page

**Files:**
- Create: `app/(dashboard)/grain/[slug]/page.tsx`
- Create: `components/dashboard/grain-chart.tsx`
- Create: `components/dashboard/provincial-cards.tsx`
- Create: `components/dashboard/disposition-bar.tsx`

**Step 1: Create grain chart component (client component for Recharts)**

Create `components/dashboard/grain-chart.tsx`:

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface WeeklyDataPoint {
  week: number;
  weekDate: string;
  Alberta: number;
  Saskatchewan: number;
  Manitoba: number;
  total: number;
}

interface GrainChartProps {
  deliveries: WeeklyDataPoint[];
  shipments: WeeklyDataPoint[];
  title: string;
}

export function GrainChart({ deliveries, title }: GrainChartProps) {
  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title} — Weekly Deliveries</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={deliveries}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="week" tick={{ fontSize: 12 }} label={{ value: "Week", position: "insideBottom", offset: -5 }} />
          <YAxis tick={{ fontSize: 12 }} label={{ value: "kt", angle: -90, position: "insideLeft" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="total" name="Total" stroke="#c17f24" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Alberta" stroke="#2e6b9e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="Saskatchewan" stroke="#6d9e3a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="Manitoba" stroke="#b37d24" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Create provincial cards**

Create `components/dashboard/provincial-cards.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtKt } from "@/lib/utils/format";

interface ProvincialData {
  region: string;
  ktonnes: number;
}

const provinceConfig = {
  Alberta: { abbr: "AB", color: "bg-province-ab" },
  Saskatchewan: { abbr: "SK", color: "bg-province-sk" },
  Manitoba: { abbr: "MB", color: "bg-province-mb" },
};

export function ProvincialCards({ data }: { data: ProvincialData[] }) {
  const total = data.reduce((sum, d) => sum + d.ktonnes, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {data
        .filter((d) => d.region in provinceConfig)
        .map((d) => {
          const config = provinceConfig[d.region as keyof typeof provinceConfig];
          const pct = total > 0 ? (d.ktonnes / total) * 100 : 0;

          return (
            <Card key={d.region}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-body flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                  {d.region} ({config.abbr})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold tabular-nums">{fmtKt(d.ktonnes, 0)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${config.color} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{pct.toFixed(1)}% of total</p>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
```

**Step 3: Create disposition bar**

Create `components/dashboard/disposition-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { fmtKt } from "@/lib/utils/format";

interface Segment {
  label: string;
  value: number;
  color: string;
}

const DESTINATION_COLORS: Record<string, string> = {
  Pacific: "#2e6b9e",
  "Thunder Bay": "#437a22",
  Churchill: "#6d9e3a",
  "Eastern Terminals": "#8b7355",
  "Canadian Domestic": "#b37d24",
  "Process Elevators": "#9e7a3a",
  "Export Destinations": "#c17f24",
};

export function DispositionBar({ data }: { data: { region: string; ktonnes: number }[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = data.reduce((sum, d) => sum + d.ktonnes, 0);
  if (total === 0) return null;

  const segments: Segment[] = data
    .filter((d) => d.ktonnes > 0)
    .map((d) => ({
      label: d.region,
      value: d.ktonnes,
      color: DESTINATION_COLORS[d.region] || "#8b7355",
    }));

  return (
    <div className="space-y-2">
      <div className="flex h-6 rounded-full overflow-hidden border border-border">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.label}
              className="relative flex items-center justify-center text-[10px] text-white font-medium transition-opacity"
              style={{
                width: `${pct}%`,
                backgroundColor: seg.color,
                opacity: hovered && hovered !== seg.label ? 0.5 : 1,
              }}
              onMouseEnter={() => setHovered(seg.label)}
              onMouseLeave={() => setHovered(null)}
            >
              {pct > 8 && seg.label.split(" ")[0]}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
            {seg.label}: {fmtKt(seg.value)} ({((seg.value / total) * 100).toFixed(1)}%)
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Create grain detail page**

Create `app/(dashboard)/grain/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getGrainBySlug } from "@/lib/queries/grains";
import {
  getDeliveryTimeSeries,
  getProvincialDeliveries,
  getShipmentDistribution,
} from "@/lib/queries/observations";
import { GrainChart } from "@/components/dashboard/grain-chart";
import { ProvincialCards } from "@/components/dashboard/provincial-cards";
import { DispositionBar } from "@/components/dashboard/disposition-bar";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GrainDetailPage({ params }: Props) {
  const { slug } = await params;
  const grain = await getGrainBySlug(slug).catch(() => null);
  if (!grain) notFound();

  const [deliveries, provincial, distribution] = await Promise.all([
    getDeliveryTimeSeries(grain.name),
    getProvincialDeliveries(grain.name),
    getShipmentDistribution(grain.name),
  ]);

  // Transform delivery data for chart: group by week, split by province
  const weekMap = new Map<number, any>();
  for (const row of deliveries) {
    if (!weekMap.has(row.grain_week)) {
      weekMap.set(row.grain_week, {
        week: row.grain_week,
        weekDate: row.week_ending_date,
        Alberta: 0,
        Saskatchewan: 0,
        Manitoba: 0,
        total: 0,
      });
    }
    const entry = weekMap.get(row.grain_week)!;
    entry[row.region] = row.ktonnes;
    entry.total += row.ktonnes;
  }
  const chartData = Array.from(weekMap.values()).sort((a, b) => a.week - b.week);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold">{grain.name}</h1>
          <p className="text-sm text-muted-foreground">Crop Year 2025-26 · Weekly Statistics</p>
        </div>
      </div>

      {/* Delivery Chart */}
      <GrainChart deliveries={chartData} shipments={[]} title={grain.name} />

      {/* Provincial Deliveries */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4">Provincial Deliveries (CY Total)</h2>
        <ProvincialCards data={provincial} />
      </div>

      {/* Shipment Distribution */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4">Shipment Distribution</h2>
        <DispositionBar data={distribution} />
      </div>
    </div>
  );
}
```

**Step 5: Verify page works**

Run `npm run dev`, visit `/grain/canola`. Should show chart, provincial cards, and disposition bar with real data.

**Step 6: Commit**

```bash
git add app/\(dashboard\)/grain/ components/dashboard/
git commit -m "feat: add grain detail page with delivery chart, provincial cards, disposition bar"
```

---

## Task 13: All Grains Page

**Files:**
- Create: `app/(dashboard)/grains/page.tsx`

**Step 1: Create all grains page**

Create `app/(dashboard)/grains/page.tsx`:

```tsx
import { getGrainOverview } from "@/lib/queries/grains";
import { GrainTable } from "@/components/dashboard/grain-table";

export default async function AllGrainsPage() {
  const grains = await getGrainOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">All Grains</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete overview of all 16 Canadian grain types. Click any row for details.
        </p>
      </div>
      <GrainTable data={grains} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/\(dashboard\)/grains/
git commit -m "feat: add all grains page with sortable table"
```

---

## Task 14: Landing Page (Public)

**Files:**
- Create: `app/page.tsx`

**Step 1: Create public landing page**

Create `app/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-wheat-50 dark:bg-wheat-900">
      <header className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
        <span className="font-display text-xl text-canola font-semibold">Bushel Board</span>
        <Link href="/login">
          <Button variant="outline" size="sm">Sign In</Button>
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-24 pb-16 text-center space-y-8">
        <h1 className="text-4xl sm:text-5xl font-display font-bold leading-tight">
          Prairie Grain Market
          <br />
          <span className="text-canola">Intelligence</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Real-time Canadian grain statistics, delivered every Thursday from the
          Canadian Grain Commission. Built for farmers in Alberta, Saskatchewan,
          and Manitoba.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/login">
            <Button size="lg" className="bg-canola hover:bg-canola-dark text-white">
              Get Started
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Free during early access. No credit card required.
        </p>
      </main>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add public landing page"
```

---

## Task 15: Final Verification and Deploy

**Step 1: Run full build**

```bash
npm run build
```

Expected: Builds successfully with no errors.

**Step 2: Test locally**

```bash
npm run dev
```

Verify:
- Landing page at `/` renders
- `/login` shows magic link form
- After auth, dashboard shows real grain data from Supabase
- `/grain/canola` shows chart + provincial cards + disposition bar
- `/grains` shows sortable table
- Dark mode toggle works
- Mobile responsive (resize browser)
- CGC freshness indicator shows correct week

**Step 3: Deploy to Vercel**

```bash
npx vercel --prod
```

Or connect GitHub repo to Vercel dashboard. Set environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification before deploy"
```

---

## Summary

| Task | Workstream | Description | Est. Complexity |
|------|-----------|-------------|-----------------|
| 1 | A | Scaffold Next.js project | Low |
| 2 | A | Design system (Tailwind + fonts) | Low |
| 3 | B | Database schema migration | Medium |
| 4 | B | Dashboard SQL views | Medium |
| 5 | B | Supabase client config | Low |
| 6 | B | CGC backfill script | Medium |
| 7 | B | Weekly import Edge Function | Medium |
| 8 | C | Auth (login + callback) | Low |
| 9 | D | Dashboard layout shell | Medium |
| 10 | D | Data query layer | Medium |
| 11 | D | Overview page | Medium |
| 12 | D | Grain detail page | High |
| 13 | D | All grains page | Low |
| 14 | D | Landing page | Low |
| 15 | All | Final verification + deploy | Low |

**Parallel agent assignment:**
- **Agent 1 (Foundation):** Tasks 1-2, then assists with 15
- **Agent 2 (Data Pipeline):** Tasks 3-7 (needs Task 1 done first)
- **Agent 3 (Auth + Layout):** Tasks 5, 8-9 (needs Task 1 done first)
- **Agent 4 (Dashboard UI):** Tasks 10-14 (needs Tasks 1-2 done, can mock data initially)
