# Bushel Board MVP Design

**Date:** 2026-03-04
**Status:** Approved
**Scope:** Data-first MVP with CGC auto-import, grain dashboard, magic link auth

## Stack

- **Frontend:** Next.js (App Router) + TypeScript on Vercel
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, pg_cron)
- **UI:** shadcn/ui + Tailwind CSS, customized with existing wheat palette (DM Sans body, Fraunces display)
- **Charts:** Chart.js (or Recharts for React integration)
- **Architecture:** Hybrid — Server Components for page loads, Supabase client for auth/realtime, Edge Functions for scheduled imports

## Database Schema

### cgc_observations (core data — long format)

Stores CGC weekly grain statistics in their native CSV format. One row per observation.

```sql
CREATE TABLE cgc_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  week_ending_date date NOT NULL,
  worksheet text NOT NULL,
  metric text NOT NULL,
  period text NOT NULL,
  grain text NOT NULL,
  grade text,
  region text NOT NULL,
  ktonnes numeric NOT NULL,
  UNIQUE(crop_year, grain_week, worksheet, metric, period, grain, grade, region)
);

CREATE INDEX idx_cgc_obs_grain_week ON cgc_observations(grain, grain_week);
CREATE INDEX idx_cgc_obs_worksheet_metric ON cgc_observations(worksheet, metric);
CREATE INDEX idx_cgc_obs_crop_year ON cgc_observations(crop_year);
```

### cgc_imports (audit log)

```sql
CREATE TABLE cgc_imports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_at timestamptz DEFAULT now(),
  crop_year text,
  grain_week int,
  source_file text,
  rows_inserted int,
  rows_skipped int,
  status text DEFAULT 'success',
  error_message text
);
```

### grains (lookup table)

```sql
CREATE TABLE grains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  category text,
  display_order int
);
```

### profiles (extends Supabase auth)

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  display_name text,
  province text,
  nearest_town text,
  created_at timestamptz DEFAULT now()
);
```

### Dashboard Views

```sql
CREATE VIEW v_grain_deliveries AS
SELECT grain, grain_week, week_ending_date, region, period, ktonnes
FROM cgc_observations
WHERE worksheet = 'Primary' AND metric = 'Deliveries';

CREATE VIEW v_grain_stocks AS
SELECT grain, grain_week, week_ending_date, region, ktonnes
FROM cgc_observations
WHERE metric = 'Stocks' AND period = 'Current Week';

CREATE VIEW v_terminal_exports AS
SELECT grain, grain_week, week_ending_date, region, ktonnes
FROM cgc_observations
WHERE worksheet = 'Terminal Exports' AND period = 'Current Week';
```

## CGC Import Pipeline

### Three Edge Functions

| Function | Schedule | Purpose |
|---|---|---|
| `cgc-weekly-import` | Every Thursday 1pm MST (pg_cron: `0 20 * * 4` UTC) | Fetch individual week CSV, insert new rows |
| `cgc-integrity-check` | Every 10 weeks, Sunday 2am MST | Download full cumulative CSV, compare row counts, backfill corrections |
| `cgc-backfill` | Manual (one-time) | Initial historical load of full CSV |

### Weekly Import Flow

1. Calculate current grain week number from date
2. Fetch `gsw-shg-{week}-en.csv` from CGC
3. Parse CSV rows (Deno CSV parser)
4. INSERT INTO cgc_observations ... ON CONFLICT DO NOTHING
5. Log result to cgc_imports
6. If file not available (CGC late), retry at 3pm MST

### Integrity Check Flow (every 10 weeks)

1. Download full `gsw-shg-en.csv`
2. Count rows per (crop_year, grain_week) in CSV
3. Compare against database counts
4. If mismatches: delete affected weeks, re-insert from CSV
5. Log results to cgc_imports with status 'integrity_check'

## Frontend Architecture

### Project Structure

```
bushel-board-app/
├── app/
│   ├── layout.tsx              -- Root layout (fonts, theme, nav)
│   ├── page.tsx                -- Public landing page
│   ├── (dashboard)/
│   │   ├── layout.tsx          -- Dashboard shell (auth guard)
│   │   ├── page.tsx            -- Overview
│   │   ├── grain/[slug]/page.tsx
│   │   └── grains/page.tsx
│   └── (auth)/
│       ├── login/page.tsx
│       └── callback/page.tsx
├── components/
│   ├── ui/                     -- shadcn/ui base
│   ├── dashboard/              -- Domain components
│   └── layout/                 -- Nav, mobile nav, theme toggle
├── lib/
│   ├── supabase/               -- Client, server, middleware
│   ├── queries/                -- Typed data queries
│   └── utils/                  -- Format, colors
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── config.toml
└── tailwind.config.ts
```

### Design System (Tailwind)

Port existing CSS tokens into Tailwind config:

```
wheat: { 50: '#f5f3ee', 100: '#ebe7dc', ... }
canola: { DEFAULT: '#c17f24', light: '#d4983e' }
prairie: { DEFAULT: '#437a22' }
province: { ab: '#2e6b9e', sk: '#6d9e3a', mb: '#b37d24' }
```

Fonts: DM Sans (body), Fraunces (display/headings)
Base: shadcn/ui components customized with warm palette

### Data Fetching

- Server Components query Supabase directly (no API layer)
- Typed query functions in `lib/queries/`
- Charts use client components with data passed as props from server

### Key Components

- **MarketTicker** — scrolling price bar (client, animated)
- **PipelineCard** — grain supply pipeline with progress bars
- **GrainChart** — delivery/shipment time series (Chart.js or Recharts)
- **DispositionBar** — stacked horizontal bar for demand breakdown
- **ProvincialCards** — AB/SK/MB stock comparison
- **GrainTable** — sortable all-grains table
- **CgcFreshness** — data freshness indicator from cgc_imports
- **ThemeToggle** — dark/light mode

## Auth Flow

Magic link authentication via Supabase:

1. Farmer visits /login, enters email
2. Supabase sends magic link email
3. Click link → /auth/callback verifies token, creates session
4. New user → redirect to optional onboarding (province, nearest town)
5. Existing user → redirect to dashboard
6. Session maintained via Supabase cookie middleware
7. Dashboard routes protected via layout auth guard

## MVP Feature Scope

### Included

- CGC weekly data auto-import (Thursday 1pm MST)
- 10-week integrity check
- Grain dashboard overview (pipeline cards, disposition)
- Individual grain detail pages (16 grains)
- Delivery/shipment time series charts
- Provincial stock breakdowns (AB/SK/MB)
- All grains sortable table
- Data freshness indicator (real, from cgc_imports)
- Dark mode
- Magic link auth
- Mobile responsive

### Deferred

- Phase 2: Elevator bids, prairie map, COT data, CN/CP rail, port monitoring, news/X
- Phase 3: Farmer chat, farm data input
- Phase 4: American farmer support

## Agent Swarm Plan

Build with parallel agents:

- **DB Agent**: Supabase migrations, schema, views, RLS policies
- **Edge Function Agent**: CGC import functions (weekly, integrity, backfill)
- **Frontend Agent(s)**: Next.js setup, components, pages
- **Auth Agent**: Supabase auth, middleware, login/callback pages

Details in implementation plan.
