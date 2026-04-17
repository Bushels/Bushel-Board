# Bushy Chat Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the LLM-agnostic chat harness specified in `2026-04-16-bushy-chat-harness-design.md` — a stateless Vercel API route that streams Bushy chat responses, captures tiered memory, supports A/B model swapping, and gets smarter via nightly reflection + compression.

**Architecture:** Six-layer harness in `lib/bushy/*` (adapters, tools, persona, memory, audit, compression). One Next.js API route handles real-time chat; five Vercel Cron routes handle reflection/compression/learning/audit. All state in Supabase. Existing `chat-completion` Edge Function deprecated after cutover.

**Tech Stack:** Next.js 16 (Node 22, maxDuration 300), Supabase (Postgres + RLS), TypeScript, Vitest, Zod, `@anthropic-ai/sdk`, existing `openai` SDK, `@modelcontextprotocol/sdk` (when MCPs added), Vercel Cron.

**Reference design doc:** `docs/plans/2026-04-16-bushy-chat-harness-design.md` — every architectural choice and table schema lives there. This plan focuses on *how* to build it; the design doc owns *what*.

---

## How to Use This Plan

- **Execute top to bottom within a workstream.** Workstreams 1–5 are the foundation and must complete before WS6 (the harness) can wire them together.
- **Workstreams can parallelize after WS1.** WS2/3/4/5 can run concurrently in different worktrees once migrations are in.
- **Every task ends with a commit.** Frequent commits = easy rollback.
- **TDD where it makes sense:** pure functions (intent detection, weather routing, cost math) get tests first; database migrations and SSE plumbing get integration smoke tests.
- **No app-level test infrastructure exists today.** WS0 sets it up.

---

## Workstream 0: Pre-Work — Deps & Test Setup

### Task 0.1: Install runtime dependencies

**Step 1: Run install**

```bash
npm install @anthropic-ai/sdk
npm install -D vitest@latest @vitest/ui
```

(Vitest is already a `npm test` script; verify it's installed and add the UI for local debugging.)

**Step 2: Verify Vitest works**

Create `vitest.config.ts` at repo root:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

**Step 3: Sanity-check test**

Create `lib/bushy/__sanity__/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('test harness sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed.

**Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/bushy/__sanity__/setup.test.ts
git commit -m "chore(bushy): set up vitest config + anthropic sdk dep"
```

---

### Task 0.2: Add required env vars to `.env.example`

**File:** `.env.example` (modify)

**Append:**

```
# Bushy Chat Harness
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
XAI_API_KEY=
ECCC_USER_AGENT=BushelsApp/1.0 (kyle@bushelsenergy.com)
NOAA_USER_AGENT=BushelsApp/1.0 (kyle@bushelsenergy.com)

# Bushy Cron Auth (shared secret for Vercel Cron → API route auth)
BUSHY_CRON_SECRET=

# Bushy Admin Notification (for nightly reflection emails)
BUSHY_ADMIN_EMAIL=kyle@bushelsenergy.com
```

**Commit:**

```bash
git add .env.example
git commit -m "chore(bushy): document required env vars"
```

---

## Workstream 1: Database Migrations

All migrations follow `supabase/migrations/YYYYMMDDHHMMSS_name.sql` naming. Use `20260417000000_*` series so they apply cleanly after current production state. Each migration is its own task + commit so rollback is granular.

### Task 1.1: Extend `chat_extractions` with reasoning + review columns

**File:** `supabase/migrations/20260417000000_chat_extractions_review.sql` (create)

```sql
-- Add reasoning + human-review columns to chat_extractions
-- Per design doc Section 4
ALTER TABLE chat_extractions
  ADD COLUMN IF NOT EXISTS reasoning text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','keep','discard','defer')),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS idx_chat_extractions_review_status
  ON chat_extractions(review_status, extracted_at)
  WHERE review_status = 'pending';

COMMENT ON COLUMN chat_extractions.reasoning IS
  'Bushy''s justification for capturing this extraction. Used by nightly reflection.';
COMMENT ON COLUMN chat_extractions.review_status IS
  'pending=unreviewed, keep=Kyle approved, discard=Kyle rejected, defer=let compression decide';
```

**Apply + verify:**

```bash
npx supabase db push
psql "$SUPABASE_URL" -c "\d chat_extractions" | grep -E '(reasoning|review_status)'
```

Expected: both columns listed.

**Commit:**

```bash
git add supabase/migrations/20260417000000_chat_extractions_review.sql
git commit -m "feat(db): add reasoning + review columns to chat_extractions"
```

---

### Task 1.2: Create `nightly_reflections` table

**File:** `supabase/migrations/20260417000100_nightly_reflections.sql` (create)

```sql
CREATE TABLE nightly_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_date date NOT NULL UNIQUE,
  model_used text NOT NULL,
  extractions_reviewed int NOT NULL DEFAULT 0,
  report_markdown text NOT NULL,
  report_json jsonb NOT NULL,
  flagged_for_review int NOT NULL DEFAULT 0,
  auto_discarded int NOT NULL DEFAULT 0,
  surprising_captures jsonb,
  pattern_hints jsonb,
  kyle_decisions_pending int NOT NULL DEFAULT 0,
  kyle_decisions_made int NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  review_completed_at timestamptz
);

CREATE INDEX idx_nightly_reflections_date ON nightly_reflections(reflection_date DESC);

ALTER TABLE nightly_reflections ENABLE ROW LEVEL SECURITY;

-- Only admins can read; service role bypasses
CREATE POLICY "admins read reflections" ON nightly_reflections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

GRANT SELECT ON nightly_reflections TO authenticated;
```

**Verify + commit:**

```bash
npx supabase db push
git add supabase/migrations/20260417000100_nightly_reflections.sql
git commit -m "feat(db): create nightly_reflections table"
```

---

### Task 1.3: Create `extraction_lessons` table

**File:** `supabase/migrations/20260417000200_extraction_lessons.sql` (create)

```sql
CREATE TABLE extraction_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_text text NOT NULL,
  category_scope text CHECK (category_scope IN
    ('market','agronomic','weather','intent','logistics','input_cost') OR category_scope IS NULL),
  evidence_count int NOT NULL DEFAULT 0,
  confidence smallint NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reinforced_at timestamptz,
  superseded_by uuid REFERENCES extraction_lessons(id)
);

CREATE INDEX idx_extraction_lessons_active
  ON extraction_lessons(category_scope, confidence DESC)
  WHERE status = 'active';

-- RPC: get active lessons for prompt injection
CREATE FUNCTION get_active_extraction_lessons(p_category text DEFAULT NULL)
RETURNS TABLE(lesson_text text, category_scope text, confidence smallint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT lesson_text, category_scope, confidence
  FROM extraction_lessons
  WHERE status = 'active'
    AND (p_category IS NULL OR category_scope IS NULL OR category_scope = p_category)
  ORDER BY confidence DESC, created_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION get_active_extraction_lessons(text) TO authenticated, service_role;
```

**Verify + commit:**

```bash
npx supabase db push
psql "$SUPABASE_URL" -c "SELECT * FROM get_active_extraction_lessons(NULL);"
git add supabase/migrations/20260417000200_extraction_lessons.sql
git commit -m "feat(db): create extraction_lessons table + RPC"
```

---

### Task 1.4: Create `chat_turns_audit` table

**File:** `supabase/migrations/20260417000300_chat_turns_audit.sql` (create)

```sql
CREATE TABLE chat_turns_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id text NOT NULL,
  thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  response_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  model_id text NOT NULL,
  provider text NOT NULL,
  experiment_id uuid,
  assigned_variant text CHECK (assigned_variant IN ('control','variant')),
  system_prompt_hash text NOT NULL,
  system_prompt_tokens int NOT NULL DEFAULT 0,
  prompt_tokens int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  latency_first_token_ms int,
  latency_total_ms int,
  tool_call_count int NOT NULL DEFAULT 0,
  tool_calls_jsonb jsonb,
  extractions_written int NOT NULL DEFAULT 0,
  extraction_ids uuid[],
  finish_reason text NOT NULL DEFAULT 'stop'
    CHECK (finish_reason IN ('stop','length','tool_use','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user_date ON chat_turns_audit(user_id, created_at DESC);
CREATE INDEX idx_audit_model_date ON chat_turns_audit(model_id, created_at DESC);
CREATE INDEX idx_audit_experiment ON chat_turns_audit(experiment_id, assigned_variant)
  WHERE experiment_id IS NOT NULL;
CREATE INDEX idx_audit_errors ON chat_turns_audit(created_at DESC)
  WHERE finish_reason = 'error';

ALTER TABLE chat_turns_audit ENABLE ROW LEVEL SECURITY;
-- Admins read all; service role writes
CREATE POLICY "admin read audit" ON chat_turns_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
GRANT SELECT ON chat_turns_audit TO authenticated;
```

**Commit:**

```bash
npx supabase db push
git add supabase/migrations/20260417000300_chat_turns_audit.sql
git commit -m "feat(db): create chat_turns_audit table"
```

---

### Task 1.5: Create A/B routing tables

**File:** `supabase/migrations/20260417000400_chat_engine_ab.sql` (create)

```sql
CREATE TABLE chat_engine_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','paused','completed')),
  control_model_id text NOT NULL,
  variant_model_id text,
  variant_split_pct int NOT NULL DEFAULT 0
    CHECK (variant_split_pct BETWEEN 0 AND 100),
  compression_model_id text NOT NULL DEFAULT 'claude-opus-4.7',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- Only one active config at a time
CREATE UNIQUE INDEX uniq_chat_engine_active
  ON chat_engine_config(status) WHERE status = 'active';

CREATE TABLE chat_engine_routing (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES chat_engine_config(id) ON DELETE CASCADE,
  assigned_variant text NOT NULL CHECK (assigned_variant IN ('control','variant')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment_id)
);

CREATE TABLE chat_engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES chat_engine_config(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN
    ('started','kill_switch','promoted','completed')),
  event_data jsonb,
  triggered_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed initial production config
INSERT INTO chat_engine_config (name, status, control_model_id, notes)
VALUES ('production-launch', 'active', 'claude-sonnet-4.6',
        'Initial single-model launch — no variant');

GRANT SELECT ON chat_engine_config, chat_engine_routing, chat_engine_runs TO authenticated;
```

**Verify + commit:**

```bash
npx supabase db push
psql "$SUPABASE_URL" -c "SELECT * FROM chat_engine_config WHERE status='active';"
git add supabase/migrations/20260417000400_chat_engine_ab.sql
git commit -m "feat(db): A/B routing tables + seed production config"
```

---

### Task 1.6: Create `chat_quality_evals` + `chat_alerts`

**File:** `supabase/migrations/20260417000500_chat_evals_alerts.sql` (create)

```sql
CREATE TABLE chat_quality_evals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id text NOT NULL,
  eval_run_id uuid NOT NULL,
  evaluator_model text NOT NULL,
  warmth_score smallint CHECK (warmth_score BETWEEN 0 AND 100),
  brevity_score smallint CHECK (brevity_score BETWEEN 0 AND 100),
  accuracy_score smallint CHECK (accuracy_score BETWEEN 0 AND 100),
  persona_fidelity_score smallint CHECK (persona_fidelity_score BETWEEN 0 AND 100),
  helpfulness_score smallint CHECK (helpfulness_score BETWEEN 0 AND 100),
  overall_score smallint CHECK (overall_score BETWEEN 0 AND 100),
  failure_modes text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_turn ON chat_quality_evals(turn_id);
CREATE INDEX idx_quality_run ON chat_quality_evals(eval_run_id);

CREATE TABLE chat_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('CRIT','HIGH','MED','LOW')),
  alert_type text NOT NULL,
  details jsonb NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_unack
  ON chat_alerts(severity, created_at DESC)
  WHERE acknowledged_at IS NULL;

GRANT SELECT ON chat_quality_evals, chat_alerts TO authenticated;
```

**Commit:**

```bash
npx supabase db push
git add supabase/migrations/20260417000500_chat_evals_alerts.sql
git commit -m "feat(db): chat_quality_evals + chat_alerts tables"
```

---

### Task 1.7: Create `persona_chunks` table (L2 retrievable)

**File:** `supabase/migrations/20260417000600_persona_chunks.sql` (create)

```sql
CREATE TABLE persona_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_book text NOT NULL,
  topic text NOT NULL,
  chunk_text text NOT NULL,
  -- embedding vector(1536),  -- Phase 2: enable when we add semantic search
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_persona_chunks_topic ON persona_chunks(topic);

GRANT SELECT ON persona_chunks TO authenticated, service_role;
```

**Commit:**

```bash
npx supabase db push
git add supabase/migrations/20260417000600_persona_chunks.sql
git commit -m "feat(db): persona_chunks table (L2 retrievable)"
```

---

### Task 1.8: Create `weather_cache` + `weather_station_map`

**File:** `supabase/migrations/20260417000700_weather_tables.sql` (create)

```sql
CREATE TABLE weather_cache (
  cache_key text PRIMARY KEY,         -- "{postalOrZip}|{includeForecast}"
  postal_or_zip text NOT NULL,
  country text NOT NULL CHECK (country IN ('CA','US')),
  snapshot_json jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE INDEX idx_weather_cache_expires ON weather_cache(expires_at);

CREATE TABLE weather_station_map (
  fsa_code text PRIMARY KEY,
  province text NOT NULL CHECK (province IN ('AB','SK','MB','BC','ON','QC','NB','NS','PE','NL','YT','NT','NU')),
  station_code text NOT NULL,         -- e.g. 'ab-30' for Edmonton
  station_name text NOT NULL,
  lat numeric(7,4),
  lon numeric(7,4)
);

GRANT SELECT ON weather_cache, weather_station_map TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON weather_cache TO service_role;
```

**Commit:**

```bash
npx supabase db push
git add supabase/migrations/20260417000700_weather_tables.sql
git commit -m "feat(db): weather_cache + weather_station_map tables"
```

---

### Task 1.9: Seed prairie weather station map

**File:** `scripts/seed-weather-stations.ts` (create)

```typescript
// Seeds weather_station_map with prairie FSA → ECCC station mappings.
// Run: npx tsx scripts/seed-weather-stations.ts
import { createClient } from '@supabase/supabase-js';

// Curated map: prairie FSA prefix → nearest major weather station.
// Source: Environment Canada weather.gc.ca city pages.
// Initial seed covers ~50 prairie FSAs; expand as coverage gaps appear.
const STATIONS = [
  // Alberta
  { fsa: 'T0L', province: 'AB', code: 'ab-30', name: 'Edmonton', lat: 53.5461, lon: -113.4938 },
  { fsa: 'T0E', province: 'AB', code: 'ab-30', name: 'Edmonton', lat: 53.5461, lon: -113.4938 },
  { fsa: 'T1A', province: 'AB', code: 'ab-52', name: 'Medicine Hat', lat: 50.0405, lon: -110.6764 },
  { fsa: 'T2P', province: 'AB', code: 'ab-52', name: 'Calgary', lat: 51.0447, lon: -114.0719 },
  // Saskatchewan
  { fsa: 'S4P', province: 'SK', code: 'sk-32', name: 'Regina', lat: 50.4452, lon: -104.6189 },
  { fsa: 'S7K', province: 'SK', code: 'sk-40', name: 'Saskatoon', lat: 52.1332, lon: -106.6700 },
  { fsa: 'S0K', province: 'SK', code: 'sk-32', name: 'Regina', lat: 50.4452, lon: -104.6189 },
  // Manitoba
  { fsa: 'R3C', province: 'MB', code: 'mb-38', name: 'Winnipeg', lat: 49.8951, lon: -97.1384 },
  { fsa: 'R0J', province: 'MB', code: 'mb-38', name: 'Winnipeg', lat: 49.8951, lon: -97.1384 },
  // ... (extend as needed; ~50-200 FSAs at full coverage)
];

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  const rows = STATIONS.map(s => ({
    fsa_code: s.fsa, province: s.province, station_code: s.code,
    station_name: s.name, lat: s.lat, lon: s.lon,
  }));

  const { error, count } = await supabase
    .from('weather_station_map')
    .upsert(rows, { onConflict: 'fsa_code', count: 'exact' });

  if (error) {
    process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ ok: true, seeded: count }) + '\n');
}

main();
```

**Add npm script** to `package.json`:

```json
"seed-weather-stations": "npx tsx scripts/seed-weather-stations.ts"
```

**Run + commit:**

```bash
npm run seed-weather-stations
git add scripts/seed-weather-stations.ts package.json
git commit -m "feat(db): seed prairie weather station map"
```

---

### Task 1.10: Add monitoring views

**File:** `supabase/migrations/20260417000800_chat_monitoring_views.sql` (create)

```sql
-- v_chat_daily_health
CREATE OR REPLACE VIEW v_chat_daily_health AS
SELECT
  date_trunc('day', created_at)::date AS date,
  COUNT(*) AS total_turns,
  COUNT(DISTINCT user_id) AS unique_users,
  ROUND(AVG(cost_usd)::numeric, 4) AS avg_cost_per_turn,
  ROUND(SUM(cost_usd)::numeric, 2) AS total_cost,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_total_ms)::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_total_ms)::int AS p95_latency_ms,
  ROUND(100.0 * SUM((finish_reason = 'error')::int) / COUNT(*), 2) AS error_rate_pct
FROM chat_turns_audit
WHERE created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- v_model_performance_7d
CREATE OR REPLACE VIEW v_model_performance_7d AS
SELECT
  a.model_id,
  COUNT(*) AS total_turns,
  ROUND(AVG(e.overall_score)::numeric, 1) AS avg_overall_score,
  ROUND(AVG(a.cost_usd)::numeric, 4) AS avg_cost_per_turn,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY a.latency_total_ms)::int AS p95_latency_ms,
  ROUND(100.0 * SUM((a.finish_reason='error')::int) / COUNT(*), 2) AS error_rate_pct
FROM chat_turns_audit a
LEFT JOIN chat_quality_evals e USING (turn_id)
WHERE a.created_at > now() - interval '7 days'
GROUP BY a.model_id
ORDER BY total_turns DESC;

-- v_experiment_status
CREATE OR REPLACE VIEW v_experiment_status AS
SELECT
  c.id AS experiment_id,
  c.name,
  c.status,
  EXTRACT(day FROM (now() - c.created_at))::int AS days_running,
  COUNT(*) FILTER (WHERE a.assigned_variant = 'control') AS control_turns,
  COUNT(*) FILTER (WHERE a.assigned_variant = 'variant') AS variant_turns,
  ROUND(AVG(e.overall_score) FILTER (WHERE a.assigned_variant='control')::numeric, 1) AS control_quality,
  ROUND(AVG(e.overall_score) FILTER (WHERE a.assigned_variant='variant')::numeric, 1) AS variant_quality,
  ROUND(AVG(a.cost_usd) FILTER (WHERE a.assigned_variant='control')::numeric, 4) AS control_cost,
  ROUND(AVG(a.cost_usd) FILTER (WHERE a.assigned_variant='variant')::numeric, 4) AS variant_cost
FROM chat_engine_config c
LEFT JOIN chat_turns_audit a ON a.experiment_id = c.id
LEFT JOIN chat_quality_evals e USING (turn_id)
WHERE c.status IN ('active','completed')
GROUP BY c.id, c.name, c.status, c.created_at;

-- v_memory_health
CREATE OR REPLACE VIEW v_memory_health AS
SELECT
  date_trunc('day', extracted_at)::date AS date,
  COUNT(*) AS extractions_total,
  ROUND(100.0 * SUM(promoted::int) / NULLIF(COUNT(*),0), 1) AS promoted_pct,
  ROUND(100.0 * SUM(discarded::int) / NULLIF(COUNT(*),0), 1) AS discarded_pct,
  ROUND(100.0 * SUM((review_status='keep')::int) / NULLIF(COUNT(*),0), 1) AS kyle_kept_pct,
  ROUND(100.0 * SUM((review_status='discard')::int) / NULLIF(COUNT(*),0), 1) AS kyle_discarded_pct,
  (SELECT COUNT(*) FROM extraction_lessons WHERE status='active') AS lessons_active
FROM chat_extractions
WHERE extracted_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- v_cost_alerts
CREATE OR REPLACE VIEW v_cost_alerts AS
WITH user_daily AS (
  SELECT user_id, date_trunc('day', created_at)::date AS date,
         SUM(cost_usd) AS daily_cost,
         COUNT(*) AS conversation_count
  FROM chat_turns_audit
  WHERE created_at > now() - interval '7 days'
  GROUP BY 1, 2
),
p95 AS (
  SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY daily_cost) AS p95_cost FROM user_daily
)
SELECT u.user_id, u.date, ROUND(u.daily_cost::numeric, 2) AS daily_cost,
       ROUND(p95.p95_cost::numeric, 2) AS p95_user_cost,
       u.conversation_count
FROM user_daily u, p95
WHERE u.daily_cost > p95.p95_cost
ORDER BY u.daily_cost DESC;

-- v_tool_usage_7d
CREATE OR REPLACE VIEW v_tool_usage_7d AS
SELECT
  jsonb_array_elements_text(tool_calls_jsonb -> 'tools') AS tool_name,
  COUNT(*) AS total_calls,
  ROUND(AVG(latency_total_ms)::numeric, 0) AS avg_latency_ms
FROM chat_turns_audit
WHERE created_at > now() - interval '7 days' AND tool_call_count > 0
GROUP BY 1
ORDER BY total_calls DESC;

GRANT SELECT ON
  v_chat_daily_health, v_model_performance_7d, v_experiment_status,
  v_memory_health, v_cost_alerts, v_tool_usage_7d
TO authenticated;
```

**Commit:**

```bash
npx supabase db push
psql "$SUPABASE_URL" -c "SELECT * FROM v_chat_daily_health LIMIT 5;"
git add supabase/migrations/20260417000800_chat_monitoring_views.sql
git commit -m "feat(db): six chat monitoring views"
```

---

### Task 1.11: Add `assign_chat_engine_variant` RPC

**File:** `supabase/migrations/20260417000900_assign_variant_rpc.sql` (create)

```sql
-- Deterministic A/B assignment. Sticky per (user, experiment).
CREATE OR REPLACE FUNCTION assign_chat_engine_variant(p_user_id uuid)
RETURNS TABLE(experiment_id uuid, model_id text, variant text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_config record;
  v_existing record;
  v_assigned text;
  v_hash int;
BEGIN
  SELECT * INTO v_config FROM chat_engine_config WHERE status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active chat_engine_config';
  END IF;

  IF v_config.variant_model_id IS NULL OR v_config.variant_split_pct = 0 THEN
    RETURN QUERY SELECT v_config.id, v_config.control_model_id, 'control'::text;
    RETURN;
  END IF;

  SELECT * INTO v_existing FROM chat_engine_routing
    WHERE user_id = p_user_id AND chat_engine_routing.experiment_id = v_config.id;

  IF FOUND THEN
    v_assigned := v_existing.assigned_variant;
  ELSE
    v_hash := abs(hashtextextended(p_user_id::text || v_config.id::text, 0)::int) % 100;
    v_assigned := CASE WHEN v_hash < v_config.variant_split_pct THEN 'variant' ELSE 'control' END;
    INSERT INTO chat_engine_routing(user_id, experiment_id, assigned_variant)
      VALUES (p_user_id, v_config.id, v_assigned)
      ON CONFLICT (user_id, experiment_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT
    v_config.id,
    CASE WHEN v_assigned = 'variant' THEN v_config.variant_model_id ELSE v_config.control_model_id END,
    v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_chat_engine_variant(uuid) TO service_role;
```

**Verify + commit:**

```bash
npx supabase db push
psql "$SUPABASE_URL" -c "SELECT * FROM assign_chat_engine_variant('00000000-0000-0000-0000-000000000000');"
git add supabase/migrations/20260417000900_assign_variant_rpc.sql
git commit -m "feat(db): assign_chat_engine_variant RPC"
```

---

### WS1 Verification Milestone

After WS1 completes, you should be able to:

```bash
# All migrations applied
psql "$SUPABASE_URL" -c "\dt nightly_reflections chat_turns_audit chat_engine_config extraction_lessons"

# Production config exists
psql "$SUPABASE_URL" -c "SELECT * FROM chat_engine_config WHERE status='active';"

# Variant assignment works
psql "$SUPABASE_URL" -c "SELECT * FROM assign_chat_engine_variant(auth.uid());"

# Views queryable (will be empty)
psql "$SUPABASE_URL" -c "SELECT * FROM v_chat_daily_health;"
```

If all pass, WS2/3/4/5 can begin in parallel.

---

## Workstream 2: LLM Adapter Layer

### Task 2.1: Define `LLMAdapter` interface + shared types

**File:** `lib/bushy/adapters/types.ts` (create)

```typescript
import { z } from 'zod';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamDelta {
  type: 'text' | 'tool_call' | 'done' | 'error';
  text?: string;
  toolCall?: ToolCall;
  error?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; cached_tokens?: number };
}

export interface TurnResult {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd: number;
  latencyMs: number;
  toolCallCount: number;
  finishReason: 'stop' | 'length' | 'tool_use' | 'error';
}

export interface LLMAdapter {
  readonly modelId: string;
  readonly provider: string;

  streamCompletion(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onDelta: (delta: StreamDelta) => void;
    onToolCall: (call: ToolCall) => Promise<string>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<TurnResult>;
}
```

**Commit:**

```bash
git add lib/bushy/adapters/types.ts
git commit -m "feat(bushy): LLMAdapter interface + shared types"
```

---

### Task 2.2: Pricing table + cost calculator (TDD)

**Files:**
- Create: `lib/bushy/adapters/pricing.ts`
- Test: `lib/bushy/adapters/pricing.test.ts`

**Step 1: Write failing test**

```typescript
// lib/bushy/adapters/pricing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCost, MODEL_PRICING } from './pricing';

describe('calculateCost', () => {
  it('computes claude-sonnet-4.6 cost from token counts', () => {
    // Sonnet 4.6: $3/M input, $15/M output
    const cost = calculateCost('claude-sonnet-4.6', {
      promptTokens: 1000, completionTokens: 500, cachedTokens: 0,
    });
    expect(cost).toBeCloseTo(1000 * 0.000003 + 500 * 0.000015, 6);
  });

  it('discounts cached tokens (Anthropic prompt cache hit)', () => {
    const cost = calculateCost('claude-sonnet-4.6', {
      promptTokens: 1000, completionTokens: 0, cachedTokens: 800,
    });
    // Cached at 10% of input price; uncached portion (200) at full price
    expect(cost).toBeCloseTo(200 * 0.000003 + 800 * 0.0000003, 6);
  });

  it('returns 0 for unknown model (no pricing), logs warning', () => {
    const cost = calculateCost('unknown-model', {
      promptTokens: 1000, completionTokens: 500, cachedTokens: 0,
    });
    expect(cost).toBe(0);
  });
});
```

**Run:** `npm test -- pricing` → FAIL.

**Step 2: Implement**

```typescript
// lib/bushy/adapters/pricing.ts
type Pricing = {
  inputPerToken: number;          // USD per token
  outputPerToken: number;
  cachedInputPerToken: number;    // Discounted rate for cache hits
};

export const MODEL_PRICING: Record<string, Pricing> = {
  'claude-sonnet-4.6': {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cachedInputPerToken: 0.3 / 1_000_000,
  },
  'claude-opus-4.7': {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cachedInputPerToken: 1.5 / 1_000_000,
  },
  'gpt-4o': {
    inputPerToken: 2.5 / 1_000_000,
    outputPerToken: 10 / 1_000_000,
    cachedInputPerToken: 1.25 / 1_000_000,
  },
  'gpt-4.1': {
    inputPerToken: 2 / 1_000_000,
    outputPerToken: 8 / 1_000_000,
    cachedInputPerToken: 0.5 / 1_000_000,
  },
  'grok-4.20-reasoning': {
    inputPerToken: 5 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cachedInputPerToken: 5 / 1_000_000,
  },
};

export function calculateCost(
  modelId: string,
  tokens: { promptTokens: number; completionTokens: number; cachedTokens: number }
): number {
  const p = MODEL_PRICING[modelId];
  if (!p) {
    console.warn(`[pricing] No pricing entry for model: ${modelId}`);
    return 0;
  }
  const uncachedInput = Math.max(0, tokens.promptTokens - tokens.cachedTokens);
  return uncachedInput * p.inputPerToken
       + tokens.cachedTokens * p.cachedInputPerToken
       + tokens.completionTokens * p.outputPerToken;
}
```

**Run:** `npm test -- pricing` → PASS.

**Step 3: Commit**

```bash
git add lib/bushy/adapters/pricing.ts lib/bushy/adapters/pricing.test.ts
git commit -m "feat(bushy): model pricing table + cost calculator (tested)"
```

---

### Task 2.3: AnthropicAdapter

**Files:**
- Create: `lib/bushy/adapters/anthropic.ts`
- Test: `lib/bushy/adapters/anthropic.test.ts` (mocked)

Use `@anthropic-ai/sdk` `messages.stream`. Return `TurnResult` from accumulated usage.

```typescript
// lib/bushy/adapters/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { LLMAdapter, ChatMessage, ToolDefinition, ToolCall, StreamDelta, TurnResult } from './types';
import { calculateCost } from './pricing';

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic';
  private client: Anthropic;

  constructor(public readonly modelId: string) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async streamCompletion(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onDelta: (delta: StreamDelta) => void;
    onToolCall: (call: ToolCall) => Promise<string>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<TurnResult> {
    const start = Date.now();
    const anthropicTools = params.tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    let promptTokens = 0;
    let completionTokens = 0;
    let cachedTokens = 0;
    let toolCallCount = 0;
    let finishReason: TurnResult['finishReason'] = 'stop';

    // Convert messages to Anthropic format
    const anthMessages = params.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content }));

    const stream = this.client.messages.stream({
      model: this.modelId,
      system: [{
        type: 'text',
        text: params.systemPrompt,
        cache_control: { type: 'ephemeral' },  // 5-min prompt cache
      }],
      messages: anthMessages as any,
      tools: anthropicTools as any,
      max_tokens: params.maxTokens ?? 2000,
      temperature: params.temperature ?? 0.7,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        params.onDelta({ type: 'text', text: event.delta.text });
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        toolCallCount++;
        params.onDelta({
          type: 'tool_call',
          toolCall: {
            id: event.content_block.id,
            function: { name: event.content_block.name, arguments: '' },
          },
        });
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          promptTokens = event.usage.input_tokens ?? promptTokens;
          completionTokens = event.usage.output_tokens ?? completionTokens;
          cachedTokens = (event.usage as any).cache_read_input_tokens ?? 0;
        }
        if (event.delta.stop_reason) {
          finishReason = mapStopReason(event.delta.stop_reason);
        }
      }
    }

    const final = await stream.finalMessage();
    promptTokens = final.usage.input_tokens ?? promptTokens;
    completionTokens = final.usage.output_tokens ?? completionTokens;
    cachedTokens = (final.usage as any).cache_read_input_tokens ?? cachedTokens;

    params.onDelta({ type: 'done', usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, cached_tokens: cachedTokens } });

    return {
      modelId: this.modelId,
      promptTokens,
      completionTokens,
      cachedTokens,
      costUsd: calculateCost(this.modelId, { promptTokens, completionTokens, cachedTokens }),
      latencyMs: Date.now() - start,
      toolCallCount,
      finishReason,
    };
  }
}

function mapStopReason(reason: string): TurnResult['finishReason'] {
  if (reason === 'end_turn') return 'stop';
  if (reason === 'max_tokens') return 'length';
  if (reason === 'tool_use') return 'tool_use';
  return 'stop';
}
```

**Test (mocked):**

```typescript
// lib/bushy/adapters/anthropic.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: () => mockStream(),
      },
    })),
  };
});

function mockStream() {
  const events = [
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
    { type: 'message_delta', usage: { input_tokens: 100, output_tokens: 5 }, delta: { stop_reason: 'end_turn' } },
  ];
  return {
    [Symbol.asyncIterator]: async function* () { for (const e of events) yield e; },
    finalMessage: async () => ({ usage: { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 0 } }),
  };
}

describe('AnthropicAdapter', () => {
  it('streams text and returns TurnResult with cost', async () => {
    const adapter = new AnthropicAdapter('claude-sonnet-4.6');
    const deltas: any[] = [];
    const result = await adapter.streamCompletion({
      systemPrompt: 'You are Bushy',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      onDelta: d => deltas.push(d),
      onToolCall: async () => '',
    });
    expect(deltas[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(result.modelId).toBe('claude-sonnet-4.6');
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(5);
    expect(result.costUsd).toBeGreaterThan(0);
  });
});
```

**Run + commit:**

```bash
npm test -- anthropic
git add lib/bushy/adapters/anthropic.ts lib/bushy/adapters/anthropic.test.ts
git commit -m "feat(bushy): AnthropicAdapter with prompt caching"
```

---

### Task 2.4: XaiAdapter (port from Edge Function)

**Files:**
- Create: `lib/bushy/adapters/xai.ts` — port `GrokAdapter` from `supabase/functions/_shared/llm-adapter.ts`
- Replace Deno `fetch` patterns with Node `fetch` (works natively in Node 22)
- Use the xAI Responses API (already wired in current Edge Function)
- Apply same `TurnResult` shape; use `calculateCost('grok-4.20-reasoning', ...)`

Reference the existing `supabase/functions/_shared/llm-adapter.ts:GrokAdapter` for the exact streaming protocol — port it 1:1, just changing the import paths and the return type.

**Commit:**

```bash
git add lib/bushy/adapters/xai.ts
git commit -m "feat(bushy): XaiAdapter (ported from Edge Function)"
```

---

### Task 2.5: OpenAIAdapter

**File:** `lib/bushy/adapters/openai.ts`

Use the existing `openai` SDK (already in `package.json`). Mirror AnthropicAdapter structure: `client.chat.completions.create({ stream: true })`, accumulate usage, return `TurnResult`. Cost via `calculateCost('gpt-4o', ...)` or `'gpt-4.1'`.

**Commit:**

```bash
git add lib/bushy/adapters/openai.ts
git commit -m "feat(bushy): OpenAIAdapter (gpt-4o, gpt-4.1)"
```

---

### Task 2.6: OpenRouterAdapter

**File:** `lib/bushy/adapters/openrouter.ts`

OpenRouter uses an OpenAI-compatible API at `https://openrouter.ai/api/v1`. Reuse the OpenAI SDK with custom `baseURL` and `OPENROUTER_API_KEY`. Cost: pull from response `usage` field directly (OpenRouter returns it; otherwise fall back to 0).

**Commit:**

```bash
git add lib/bushy/adapters/openrouter.ts
git commit -m "feat(bushy): OpenRouterAdapter for offline shadow eval"
```

---

### Task 2.7: Adapter factory

**Files:**
- Create: `lib/bushy/adapters/index.ts`
- Test: `lib/bushy/adapters/index.test.ts`

```typescript
// lib/bushy/adapters/index.ts
import { AnthropicAdapter } from './anthropic';
import { XaiAdapter } from './xai';
import { OpenAIAdapter } from './openai';
import { OpenRouterAdapter } from './openrouter';
import type { LLMAdapter } from './types';

export function getAdapter(modelId: string): LLMAdapter {
  if (modelId.startsWith('claude-')) return new AnthropicAdapter(modelId);
  if (modelId.startsWith('grok-'))   return new XaiAdapter(modelId);
  if (modelId.startsWith('gpt-'))    return new OpenAIAdapter(modelId);
  return new OpenRouterAdapter(modelId);
}

export type { LLMAdapter, ChatMessage, ToolDefinition, ToolCall, StreamDelta, TurnResult } from './types';
```

```typescript
// lib/bushy/adapters/index.test.ts
import { describe, it, expect } from 'vitest';
import { getAdapter } from './index';

describe('getAdapter', () => {
  it.each([
    ['claude-sonnet-4.6', 'anthropic'],
    ['grok-4.20-reasoning', 'xai'],
    ['gpt-4o', 'openai'],
    ['deepseek/deepseek-chat', 'openrouter'],
  ])('routes %s to %s', (model, provider) => {
    expect(getAdapter(model).provider).toBe(provider);
  });
});
```

**Commit:**

```bash
npm test -- adapters/index
git add lib/bushy/adapters/index.ts lib/bushy/adapters/index.test.ts
git commit -m "feat(bushy): adapter factory by model_id prefix"
```

---

## Workstream 3: Tool Registry & Native Tools

### Task 3.1: BushyTool + ToolContext types

**File:** `lib/bushy/tools/types.ts` (create)

```typescript
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BushyTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  source: 'native' | 'mcp';
  mcpServer?: string;
  costEstimateUsd?: number;
  rateLimit?: { perTurn: number; perConversation: number };
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  fsaCode: string | null;
  threadId: string;
  turnId: string;
  supabase: SupabaseClient;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  costUsd?: number;
  latencyMs: number;
}

// Conversion helpers for adapter ToolDefinition
import type { ToolDefinition } from '../adapters/types';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function toToolDefinition(tool: BushyTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
    },
  };
}
```

**Install `zod-to-json-schema`:**

```bash
npm install zod-to-json-schema
```

**Commit:**

```bash
git add lib/bushy/tools/types.ts package.json package-lock.json
git commit -m "feat(bushy): BushyTool + ToolContext types"
```

---

### Task 3.2: Tool budget guardrails (TDD)

**Files:**
- Create: `lib/bushy/tools/budget.ts`
- Test: `lib/bushy/tools/budget.test.ts`

**Step 1: Test**

```typescript
// lib/bushy/tools/budget.test.ts
import { describe, it, expect } from 'vitest';
import { ToolBudget } from './budget';

describe('ToolBudget', () => {
  it('allows calls under per-turn limit', () => {
    const b = new ToolBudget({ perTurnMax: 3, perConvMax: 10, costCapUsd: 1 });
    b.recordCall('get_weather', 0.01);
    b.recordCall('get_weather', 0.01);
    expect(b.canCall('get_weather', { perTurn: 3, perConversation: 5 })).toBe(true);
  });

  it('rejects when per-turn limit exceeded', () => {
    const b = new ToolBudget({ perTurnMax: 100, perConvMax: 100, costCapUsd: 100 });
    for (let i = 0; i < 3; i++) b.recordCall('search_x', 0.01);
    expect(b.canCall('search_x', { perTurn: 3, perConversation: 10 })).toBe(false);
  });

  it('rejects when conversation cost cap exceeded', () => {
    const b = new ToolBudget({ perTurnMax: 100, perConvMax: 100, costCapUsd: 0.50 });
    b.recordCall('search_x', 0.40);
    b.recordCall('search_x', 0.20);  // total 0.60 > 0.50
    expect(b.canCall('search_x')).toBe(false);
  });

  it('starts fresh turn but keeps conversation totals', () => {
    const b = new ToolBudget({ perTurnMax: 1, perConvMax: 10, costCapUsd: 100 });
    b.recordCall('get_weather', 0);
    expect(b.canCall('get_weather', { perTurn: 1, perConversation: 10 })).toBe(false);
    b.startTurn();
    expect(b.canCall('get_weather', { perTurn: 1, perConversation: 10 })).toBe(true);
  });
});
```

**Step 2: Implement**

```typescript
// lib/bushy/tools/budget.ts
type Limits = { perTurn?: number; perConversation?: number };

export class ToolBudget {
  private convCalls = new Map<string, number>();
  private turnCalls = new Map<string, number>();
  private totalCostUsd = 0;

  constructor(private cfg: { perTurnMax: number; perConvMax: number; costCapUsd: number }) {}

  startTurn() { this.turnCalls.clear(); }

  canCall(toolName: string, limits?: Limits): boolean {
    if (this.totalCostUsd >= this.cfg.costCapUsd) return false;
    const turnCount = this.turnCalls.get(toolName) ?? 0;
    const convCount = this.convCalls.get(toolName) ?? 0;
    if (turnCount >= (limits?.perTurn ?? this.cfg.perTurnMax)) return false;
    if (convCount >= (limits?.perConversation ?? this.cfg.perConvMax)) return false;
    return true;
  }

  recordCall(toolName: string, costUsd: number) {
    this.turnCalls.set(toolName, (this.turnCalls.get(toolName) ?? 0) + 1);
    this.convCalls.set(toolName, (this.convCalls.get(toolName) ?? 0) + 1);
    this.totalCostUsd += costUsd;
  }

  snapshot() {
    return {
      convCalls: Object.fromEntries(this.convCalls),
      totalCostUsd: this.totalCostUsd,
    };
  }
}
```

**Step 3: Run + commit**

```bash
npm test -- tools/budget
git add lib/bushy/tools/budget.ts lib/bushy/tools/budget.test.ts
git commit -m "feat(bushy): tool budget guardrails (rate limits + cost cap)"
```

---

### Task 3.3: Tool registry assembly

**File:** `lib/bushy/tools/index.ts` (create)

```typescript
import type { BushyTool, ToolContext, ToolResult } from './types';
import { saveExtractionTool } from './memory';
import { supersedeKnowledgeTool } from './memory';
import { queryWorkingMemoryTool } from './memory';
import { queryMarketThesisTool } from './data';
import { queryPostedPricesTool } from './data';
import { queryAreaIntelligenceTool } from './data';
import { getWeatherTool } from './weather';
import { searchXTool } from './x-api';
// import { loadMcpTools } from './mcp-bridge';
// import { MCP_SERVERS } from './mcp-config';

const NATIVE_TOOLS: BushyTool[] = [
  saveExtractionTool,
  supersedeKnowledgeTool,
  queryWorkingMemoryTool,
  queryMarketThesisTool,
  queryPostedPricesTool,
  queryAreaIntelligenceTool,
  getWeatherTool,
  searchXTool,
];

let _registry: BushyTool[] | null = null;

export async function buildToolRegistry(): Promise<BushyTool[]> {
  if (_registry) return _registry;
  // const mcpTools = await loadMcpTools(MCP_SERVERS);  // Empty at launch
  _registry = [...NATIVE_TOOLS /*, ...mcpTools*/];
  return _registry;
}

export function findTool(name: string): BushyTool | undefined {
  return _registry?.find(t => t.name === name);
}

export type { BushyTool, ToolContext, ToolResult };
```

**Commit (file references will fail until next tasks land — that's OK, leave as scaffold):**

```bash
git add lib/bushy/tools/index.ts
git commit -m "feat(bushy): tool registry scaffold"
```

---

### Task 3.4: `save_extraction` tool

**File:** `lib/bushy/tools/memory.ts` (create — will hold 3 memory tools)

```typescript
import { z } from 'zod';
import type { BushyTool } from './types';

const SaveExtractionArgs = z.object({
  category: z.enum(['market','agronomic','weather','intent','logistics','input_cost']),
  data_type: z.string().min(1),
  grain: z.string().nullable(),
  value_numeric: z.number().nullable(),
  value_text: z.string().nullable(),
  location_detail: z.string().nullable(),
  confidence: z.enum(['reported','inferred']),
  reasoning: z.string().min(10, 'Reasoning required for nightly review'),
});

export const saveExtractionTool: BushyTool = {
  name: 'save_extraction',
  description: 'Capture a farming data point from the conversation. ALWAYS include reasoning for why this is worth saving — Kyle reviews these nightly.',
  parameters: SaveExtractionArgs,
  source: 'native',
  rateLimit: { perTurn: 5, perConversation: 20 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = SaveExtractionArgs.parse(args);
    const { error, data } = await ctx.supabase
      .from('chat_extractions')
      .insert({
        user_id: ctx.userId,
        thread_id: ctx.threadId,
        fsa_code: ctx.fsaCode,
        category: parsed.category,
        data_type: parsed.data_type,
        grain: parsed.grain,
        value_numeric: parsed.value_numeric,
        value_text: parsed.value_text,
        location_detail: parsed.location_detail,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message, latencyMs: Date.now() - start };
    return { ok: true, data: { extraction_id: data.id }, latencyMs: Date.now() - start };
  },
};

// supersedeKnowledgeTool, queryWorkingMemoryTool follow same pattern
// — see design doc for parameter shapes; both call existing RPCs
//   (get_area_knowledge for query, custom upsert for supersede).
```

**Add stubs for the other two memory tools** (`supersedeKnowledgeTool`, `queryWorkingMemoryTool`) in the same file, following the same shape — call `ctx.supabase.rpc('get_area_knowledge', ...)` and similar.

**Commit:**

```bash
git add lib/bushy/tools/memory.ts
git commit -m "feat(bushy): memory tools (save_extraction, supersede, query)"
```

---

### Task 3.5: Data tools (market thesis, posted prices, area intelligence)

**File:** `lib/bushy/tools/data.ts` (create)

Three tools, each a thin wrapper over existing RPCs:

- `queryMarketThesisTool` → reads latest `market_analysis` row for grain
- `queryPostedPricesTool` → calls `get_area_prices(p_fsa_code, p_grain)` RPC
- `queryAreaIntelligenceTool` → calls `get_area_knowledge(...)` + `get_area_patterns(...)` RPCs

Each follows the exact same shape as `saveExtractionTool` — define zod schema for args, call RPC, return `{ ok, data, latencyMs }`.

**Convention applied here:** every read-tool ALSO writes an inferred extraction. Example:

```typescript
// In queryMarketThesisTool.execute, after successful read:
await ctx.supabase.from('chat_extractions').insert({
  user_id: ctx.userId, thread_id: ctx.threadId, fsa_code: ctx.fsaCode,
  category: 'market', data_type: 'thesis_lookup',
  grain: parsed.grain, value_text: result.thesis_summary,
  confidence: 'inferred',
  reasoning: 'Auto-captured from market thesis tool call',
});
```

**Commit:**

```bash
git add lib/bushy/tools/data.ts
git commit -m "feat(bushy): data tools with auto-extraction side-effects"
```

---

### Task 3.6: `search_x` tool stub

**File:** `lib/bushy/tools/x-api.ts` (create)

Per the X API v2 design (already in `2026-04-15-hermes-chat-agent-design.md` Section 5), implement a thin wrapper around the X API. Apply the value gate (check working memory first, dedupe by query hash, log to `x_api_query_log`).

For launch, this can be a stub that returns `{ ok: false, error: 'X API not configured' }` if `XAPI_BEARER_TOKEN` is unset. Real implementation in a follow-up.

**Commit:**

```bash
git add lib/bushy/tools/x-api.ts
git commit -m "feat(bushy): search_x tool stub (value-gated)"
```

---

## Workstream 4: Weather Tool

### Task 4.1: Country detection (TDD)

**Files:**
- Create: `lib/bushy/tools/weather/detect.ts`
- Test: `lib/bushy/tools/weather/detect.test.ts`

**Step 1: Test**

```typescript
// lib/bushy/tools/weather/detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectCountry } from './detect';

describe('detectCountry', () => {
  it.each([
    ['T0L 1A0', 'CA'], ['T0L1A0', 'CA'], ['s4p 3y2', 'CA'],
    ['59401', 'US'], ['59401-1234', 'US'],
    ['12345', 'US'],
    ['ABCDE', 'unknown'], ['', 'unknown'], ['1234', 'unknown'],
  ])('%s → %s', (input, expected) => {
    expect(detectCountry(input)).toBe(expected);
  });
});
```

**Step 2: Implement**

```typescript
// lib/bushy/tools/weather/detect.ts
const CA_POSTAL = /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i;
const US_ZIP    = /^\d{5}(-\d{4})?$/;

export function detectCountry(code: string): 'CA' | 'US' | 'unknown' {
  const trimmed = code.trim();
  if (CA_POSTAL.test(trimmed)) return 'CA';
  if (US_ZIP.test(trimmed)) return 'US';
  return 'unknown';
}
```

**Step 3: Run + commit**

```bash
npm test -- weather/detect
git add lib/bushy/tools/weather/detect.ts lib/bushy/tools/weather/detect.test.ts
git commit -m "feat(bushy): postal/zip country detection"
```

---

### Task 4.2: WeatherSnapshot type + ECCC client

**Files:**
- Create: `lib/bushy/tools/weather/types.ts`
- Create: `lib/bushy/tools/weather/eccc.ts`
- Test: `lib/bushy/tools/weather/eccc.test.ts` (mock fetch)

```typescript
// lib/bushy/tools/weather/types.ts
export type WeatherSnapshot = {
  location: { name: string; provinceOrState: string; country: 'CA' | 'US' };
  current: { tempC: number; conditions: string; windKph: number; humidityPct: number };
  forecast: Array<{ date: string; highC: number; lowC: number; precipMm: number; conditions: string }>;
  agronomic?: {
    last7DaysPrecipMm: number;
    growingDegreeDays: number;
    frostRiskNext5Days: boolean;
    droughtIndex?: 'none' | 'moderate' | 'severe' | 'extreme';
  };
  source: 'eccc' | 'noaa';
  fetchedAt: string;
};
```

```typescript
// lib/bushy/tools/weather/eccc.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeatherSnapshot } from './types';

const USER_AGENT = process.env.ECCC_USER_AGENT || 'BushelsApp/1.0';

export async function getCanadianWeather(
  postalCode: string,
  supabase: SupabaseClient
): Promise<WeatherSnapshot | null> {
  // Look up FSA → station
  const fsa = postalCode.trim().slice(0, 3).toUpperCase();
  const { data: station } = await supabase
    .from('weather_station_map')
    .select('province, station_code, station_name, lat, lon')
    .eq('fsa_code', fsa)
    .maybeSingle();
  if (!station) return null;

  const url = `https://weather.gc.ca/rss/city/${station.province.toLowerCase()}-${station.station_code.split('-')[1]}_e.xml`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`ECCC ${response.status}`);
  const xml = await response.text();

  return parseEcccAtom(xml, station);
}

function parseEcccAtom(xml: string, station: any): WeatherSnapshot {
  // Minimal Atom parser — extract <entry> blocks for current + 5 day forecast
  // Each entry has <title> like "Current Conditions: 12 C, partly cloudy"
  // and <summary> with detail text.
  // Use a small regex parser; if XML structure proves brittle, swap to fast-xml-parser.
  // ...implementation...
  return {
    location: { name: station.station_name, provinceOrState: station.province, country: 'CA' },
    current: { tempC: 0, conditions: '', windKph: 0, humidityPct: 0 },  // populated from XML
    forecast: [],
    source: 'eccc',
    fetchedAt: new Date().toISOString(),
  };
}
```

**Test (mock fetch):**

```typescript
// lib/bushy/tools/weather/eccc.test.ts
import { describe, it, expect, vi } from 'vitest';
// Mock supabase + fetch; assert it returns null for unknown FSA, parses sample XML for known.
// Sample XML fixture: lib/bushy/tools/weather/__fixtures__/eccc-sample.xml
```

**Commit:**

```bash
npm test -- weather/eccc
git add lib/bushy/tools/weather/eccc.ts lib/bushy/tools/weather/types.ts lib/bushy/tools/weather/eccc.test.ts
git commit -m "feat(bushy): ECCC weather client (Atom feed parser)"
```

---

### Task 4.3: NOAA client

**File:** `lib/bushy/tools/weather/noaa.ts`

NOAA flow:
1. ZIP → lat/lon (cache in Supabase or use `https://api.zippopotam.us/us/{zip}` for first lookup)
2. `GET https://api.weather.gov/points/{lat},{lon}` → `properties.forecast` URL
3. `GET {forecast URL}` → 7-period (day/night) forecast JSON
4. Normalize to `WeatherSnapshot` (Fahrenheit → Celsius, MPH → KPH conversions)

Mandatory `User-Agent: BushelsApp/1.0 (kyle@bushelsenergy.com)` header.

**Test pattern**: mock fetch with sample NOAA JSON fixture. Assert temperature units convert correctly.

**Commit:**

```bash
npm test -- weather/noaa
git add lib/bushy/tools/weather/noaa.ts lib/bushy/tools/weather/noaa.test.ts
git commit -m "feat(bushy): NOAA weather client (api.weather.gov)"
```

---

### Task 4.4: Weather caching + composition into BushyTool

**Files:**
- Create: `lib/bushy/tools/weather/cache.ts` — read/write `weather_cache` table
- Create: `lib/bushy/tools/weather.ts` — top-level tool composing detect → cache → eccc/noaa

```typescript
// lib/bushy/tools/weather.ts (composition layer)
import { z } from 'zod';
import type { BushyTool } from './types';
import { detectCountry } from './weather/detect';
import { getCanadianWeather } from './weather/eccc';
import { getUSWeather } from './weather/noaa';
import { readCache, writeCache } from './weather/cache';

const Args = z.object({
  postalOrZip: z.string().min(3),
  includeForecast: z.boolean().default(true),
});

export const getWeatherTool: BushyTool = {
  name: 'get_weather',
  description: 'Current weather + 5-day forecast for a Canadian postal code or US ZIP. Includes precipitation, frost risk, growing-degree-day accumulation when in growing season.',
  parameters: Args,
  source: 'native',
  rateLimit: { perTurn: 1, perConversation: 4 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = Args.parse(args);
    const cacheKey = `${parsed.postalOrZip}|${parsed.includeForecast}`;
    const cached = await readCache(ctx.supabase, cacheKey);
    if (cached) return { ok: true, data: cached, latencyMs: Date.now() - start };

    const country = detectCountry(parsed.postalOrZip);
    let snapshot;
    if (country === 'CA') snapshot = await getCanadianWeather(parsed.postalOrZip, ctx.supabase);
    else if (country === 'US') snapshot = await getUSWeather(parsed.postalOrZip, ctx.supabase);
    else return { ok: false, error: 'Unrecognized postal/ZIP format', latencyMs: Date.now() - start };

    if (!snapshot) return { ok: false, error: 'No weather data available for that location', latencyMs: Date.now() - start };

    await writeCache(ctx.supabase, cacheKey, parsed.postalOrZip, country, snapshot);

    // Side-effect: write inferred weather extraction
    await ctx.supabase.from('chat_extractions').insert({
      user_id: ctx.userId, thread_id: ctx.threadId, fsa_code: ctx.fsaCode,
      category: 'weather', data_type: 'snapshot',
      value_numeric: snapshot.agronomic?.last7DaysPrecipMm ?? null,
      value_text: snapshot.current.conditions,
      confidence: 'inferred',
      reasoning: 'Auto-captured from get_weather tool call',
    });

    return { ok: true, data: snapshot, latencyMs: Date.now() - start };
  },
};
```

**Commit:**

```bash
git add lib/bushy/tools/weather.ts lib/bushy/tools/weather/cache.ts
git commit -m "feat(bushy): get_weather tool with caching + auto-extraction"
```

---

## Workstream 5: Persona Pipeline

### Task 5.1: Hand-write voice kernel

**File:** `lib/bushy/persona/voice-kernel.ts` (create)

Use the kernel verbatim from design doc Section 5 — including the anti-distraction and anti-injection rules. **Do not auto-generate; this is the identity anchor.**

**Commit:**

```bash
git add lib/bushy/persona/voice-kernel.ts
git commit -m "feat(bushy): voice kernel (static identity anchor)"
```

---

### Task 5.2: Phase 1 — text extraction script

**File:** `scripts/distill-persona/01-extract.ts` (create)

```typescript
// Extracts text from Personality books to plain .txt files.
// Run: npx tsx scripts/distill-persona/01-extract.ts
//
// Carnegie.pdf  → pdftotext (requires poppler-utils OR pdf-parse)
// Others (.epub) → pandoc OR epub-parser
//
// Outputs to data/Knowledge/processed/Personality/{book-slug}.txt
```

Use `pdf-parse` (pure JS, easier than pdftotext on Windows) for PDF and `epub2` for EPUB. Both are npm packages.

**Install:**

```bash
npm install -D pdf-parse epub2
```

**Commit:**

```bash
git add scripts/distill-persona/01-extract.ts package.json package-lock.json
git commit -m "feat(bushy): persona Phase 1 — text extraction script"
```

---

### Task 5.3: Phase 2 — chapter summary script (Sonnet)

**File:** `scripts/distill-persona/02-chapters.ts`

For each `{book}.txt`, call Claude Sonnet 4.6 with a structured prompt:

> Identify chapters and produce a JSON summary. For each chapter: `{ title, key_principles[], memorable_examples[], specific_scripts[] }`. Preserve exact phrasing for any directly applicable script (e.g., Voss's "How am I supposed to do that?").

Output: `data/Knowledge/processed/Personality/{book}-chapters.json`.

Estimated cost: ~$0.50/book. Total ~$2.

**Commit:**

```bash
git add scripts/distill-persona/02-chapters.ts
git commit -m "feat(bushy): persona Phase 2 — chapter summary script"
```

---

### Task 5.4: Phase 3 — topic synthesis script

**File:** `scripts/distill-persona/03-topics.ts`

For each of the 7 persona topics (`opening_a_conversation`, `gathering_information`, `building_rapport`, `handling_disagreement`, `delivering_hard_advice`, `silence_and_pacing`, `negotiating_data_share`), call Sonnet:

> Pull material from the 4 chapter-summary JSONs that's relevant to **{topic}**. Preserve original phrasing where powerful. Target 800 tokens. Output as markdown.

Output: `data/Knowledge/processed/Personality/topics/{topic}.md`.

**Commit:**

```bash
git add scripts/distill-persona/03-topics.ts
git commit -m "feat(bushy): persona Phase 3 — topic synthesis"
```

---

### Task 5.5: Phase 4 — L0 unification script

**File:** `scripts/distill-persona/04-l0.ts`

Sonnet reads all 7 topic chunks, generates the unified ~500 token L0 card with 8 numbered principles + topic index. Output: `persona-l0-draft.md`. Format mirrors `lib/knowledge/viking-l0.ts` exactly.

**Commit:**

```bash
git add scripts/distill-persona/04-l0.ts
git commit -m "feat(bushy): persona Phase 4 — L0 unification"
```

---

### Task 5.6: Phase 5 — verification script (Opus 4.7)

**File:** `scripts/distill-persona/05-verify.ts`

Opus reads original chapter summaries + generated L0/L1, applies three checks per chunk:

1. **Attribution accuracy** — every named principle traces to a real chapter
2. **Voice preservation** — Voss scripts verbatim, Carnegie examples present
3. **No corporate drift** — no "leverage", "stakeholder", "engagement", "circle back"

Outputs `verification-report.json` with PASS/REVISE per chunk. REVISE chunks go back to Sonnet for one revision pass (call `02-topics.ts` with feedback flag).

**Commit:**

```bash
git add scripts/distill-persona/05-verify.ts
git commit -m "feat(bushy): persona Phase 5 — Opus verification"
```

---

### Task 5.7: Phase 6 — TS file emission

**File:** `scripts/distill-persona/06-emit.ts`

Reads final markdown chunks, emits:
- `lib/bushy/persona/persona-l0.ts` — `export const PERSONA_L0 = \`...\`;`
- `lib/bushy/persona/persona-l1.ts` — `export const PERSONA_L1: Record<PersonaTopic, string> = { ... };`
- INSERT statements into `persona_chunks` table for the L2 paragraph-level content

**Wire pipeline orchestrator** at `scripts/distill-persona.ts` (top-level) that runs all 6 phases in sequence, accepting `--book <name>` to re-do one book or `--all` for full rebuild.

Add npm script:
```json
"distill-persona": "npx tsx scripts/distill-persona.ts"
```

**Run the full pipeline:**

```bash
npm run distill-persona -- --all
```

**Commit:**

```bash
git add scripts/distill-persona/ package.json
git commit -m "feat(bushy): persona Phase 6 — TS emission + pipeline orchestrator"
```

---

### Task 5.8: Intent detection (TDD)

**Files:**
- Create: `lib/bushy/persona/detect-intent.ts`
- Test: `lib/bushy/persona/detect-intent.test.ts`

**Step 1: Test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectIntent } from './detect-intent';

describe('detectIntent', () => {
  it('returns opening_a_conversation when history empty', () => {
    expect(detectIntent('hi', [])).toContain('opening_a_conversation');
  });
  it('returns handling_disagreement when farmer pushes back', () => {
    expect(detectIntent('I think you were wrong about wheat', [/* prior */])).toContain('handling_disagreement');
  });
  it('returns delivering_hard_advice for hold/haul questions', () => {
    expect(detectIntent('should I hold or haul my canola?', [])).toContain('delivering_hard_advice');
  });
  it('caps at 2 topics per turn', () => {
    expect(detectIntent('your wrong canola price was bullshit help me decide hold or haul or sell', []).length).toBeLessThanOrEqual(2);
  });
  it('falls back to building_rapport when no signals match', () => {
    expect(detectIntent('how was your day', [/* prior */])).toContain('building_rapport');
  });
});
```

**Step 2: Implement** — exact code from design doc Section 5.

**Step 3: Run + commit**

```bash
npm test -- detect-intent
git add lib/bushy/persona/detect-intent.ts lib/bushy/persona/detect-intent.test.ts
git commit -m "feat(bushy): persona intent detection (keyword/regex)"
```

---

### Task 5.9: System prompt composer

**File:** `lib/bushy/persona/system-prompt.ts`

```typescript
import { BUSHY_VOICE } from './voice-kernel';
import { PERSONA_L0, PERSONA_L1, type PersonaTopic } from './persona-l0';
import { detectIntent } from './detect-intent';
import { VIKING_L0 } from '@/lib/knowledge/viking-l0';
import { VIKING_L1 } from '@/lib/knowledge/viking-l1';
// import farmer + area helpers
import type { ChatMessage } from '../adapters/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SystemPromptContext {
  supabase: SupabaseClient;
  userId: string;
  fsaCode: string | null;
  currentMessage: string;
  history: ChatMessage[];
  toolRegistry: { name: string; description: string }[];
  farmerCard: { name?: string; cropPlan?: any; contractedPosition?: any };
}

export async function buildSystemPrompt(ctx: SystemPromptContext): Promise<string> {
  const personaTopics = detectIntent(ctx.currentMessage, ctx.history);
  const lessons = await getActiveLessons(ctx.supabase);
  const areaIntel = await getAreaIntelligence(ctx.supabase, ctx.fsaCode);

  return [
    BUSHY_VOICE,
    PERSONA_L0,
    ...personaTopics.map(t => PERSONA_L1[t]),
    VIKING_L0,
    // viking L1 topics from grain knowledge intent — separate detection
    formatLessons(lessons),
    formatFarmerCard(ctx.farmerCard),
    formatAreaIntel(areaIntel),
    formatToolDescriptions(ctx.toolRegistry),
  ].filter(Boolean).join('\n\n');
}

async function getActiveLessons(supabase: SupabaseClient) {
  const { data } = await supabase.rpc('get_active_extraction_lessons', { p_category: null });
  return data ?? [];
}

// ...helper functions...
```

**Commit:**

```bash
git add lib/bushy/persona/system-prompt.ts
git commit -m "feat(bushy): system prompt composer"
```

---

## Workstream 6: Harness Orchestrator

### Task 6.1: Harness types

**File:** `lib/bushy/types.ts` (create)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TurnResult } from './adapters/types';

export interface ChatRequest {
  threadId?: string;
  message: string;
  grainContext?: { grain: string; grainWeek: number };
}

export interface ChatTurnContext {
  supabase: SupabaseClient;
  userId: string;
  fsaCode: string | null;
  threadId: string;
  turnId: string;
  experimentId: string;
  modelId: string;
  variant: 'control' | 'variant';
}

export interface AuditRecord extends Partial<TurnResult> {
  turnId: string;
  threadId: string;
  userId: string;
  modelId: string;
  experimentId: string;
  variant: 'control' | 'variant';
  systemPromptHash: string;
  systemPromptTokens: number;
  toolCallsLog: any[];
  extractionIds: string[];
  errorMessage?: string;
}
```

**Commit:**

```bash
git add lib/bushy/types.ts
git commit -m "feat(bushy): harness types"
```

---

### Task 6.2: Variant routing helper

**File:** `lib/bushy/audit/route-ab.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export async function assignVariant(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .rpc('assign_chat_engine_variant', { p_user_id: userId })
    .maybeSingle();
  if (error || !data) throw new Error(`Variant assignment failed: ${error?.message ?? 'unknown'}`);
  return {
    experimentId: data.experiment_id as string,
    modelId: data.model_id as string,
    variant: data.variant as 'control' | 'variant',
  };
}
```

**Commit:**

```bash
git add lib/bushy/audit/route-ab.ts
git commit -m "feat(bushy): variant routing wrapper"
```

---

### Task 6.3: Audit logger

**File:** `lib/bushy/audit/log-turn.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { AuditRecord } from '../types';

export async function logTurn(supabase: SupabaseClient, record: AuditRecord) {
  await supabase.from('chat_turns_audit').insert({
    turn_id: record.turnId,
    thread_id: record.threadId,
    user_id: record.userId,
    model_id: record.modelId,
    provider: record.modelId.split('-')[0],
    experiment_id: record.experimentId,
    assigned_variant: record.variant,
    system_prompt_hash: record.systemPromptHash,
    system_prompt_tokens: record.systemPromptTokens,
    prompt_tokens: record.promptTokens ?? 0,
    completion_tokens: record.completionTokens ?? 0,
    cached_tokens: record.cachedTokens ?? 0,
    cost_usd: record.costUsd ?? 0,
    latency_total_ms: record.latencyMs,
    tool_call_count: record.toolCallCount ?? 0,
    tool_calls_jsonb: { tools: record.toolCallsLog?.map(t => t.name) ?? [], detail: record.toolCallsLog },
    extractions_written: record.extractionIds.length,
    extraction_ids: record.extractionIds,
    finish_reason: record.finishReason ?? 'stop',
    error_message: record.errorMessage,
  });
}

export function hashSystemPrompt(prompt: string): string {
  return createHash('sha1').update(prompt).digest('hex').slice(0, 16);
}
```

**Commit:**

```bash
git add lib/bushy/audit/log-turn.ts
git commit -m "feat(bushy): audit logger + system prompt hash"
```

---

### Task 6.4: Harness orchestrator

**File:** `lib/bushy/harness.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { getAdapter } from './adapters';
import { buildToolRegistry, findTool } from './tools';
import { ToolBudget } from './tools/budget';
import { toToolDefinition } from './tools/types';
import { buildSystemPrompt } from './persona/system-prompt';
import { assignVariant } from './audit/route-ab';
import { logTurn, hashSystemPrompt } from './audit/log-turn';
import type { ChatRequest } from './types';
import { randomUUID } from 'node:crypto';

const BUDGET = { perTurnMax: 4, perConvMax: 12, costCapUsd: 1.50 };

export async function runChatTurn(
  req: ChatRequest,
  user: { id: string },
  responseStream: (chunk: string) => void
): Promise<void> {
  const supabase = await createClient();
  const turnId = randomUUID();

  // Load profile (FSA, name, role)
  const { data: profile } = await supabase
    .from('profiles')
    .select('postal_code, role, full_name, company_name')
    .eq('id', user.id)
    .single();
  const fsaCode = profile?.postal_code?.slice(0, 3).toUpperCase() ?? null;

  // Load or create thread
  const threadId = req.threadId ?? await createThread(supabase, user.id);

  // Persist user message
  const { data: userMsg } = await supabase.from('chat_messages').insert({
    thread_id: threadId, user_id: user.id, role: 'user', content: req.message,
  }).select('id').single();

  // Variant routing
  const { experimentId, modelId, variant } = await assignVariant(supabase, user.id);

  // Tool registry + budget
  const tools = await buildToolRegistry();
  const budget = new ToolBudget(BUDGET);
  budget.startTurn();

  // Load history (last 20 messages)
  const { data: historyRows } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(20);
  const history = (historyRows ?? []).map(r => ({ role: r.role as any, content: r.content }));

  // Build system prompt
  const systemPrompt = await buildSystemPrompt({
    supabase, userId: user.id, fsaCode,
    currentMessage: req.message, history,
    toolRegistry: tools.map(t => ({ name: t.name, description: t.description })),
    farmerCard: { name: profile?.full_name },
  });

  const adapter = getAdapter(modelId);
  const toolDefs = tools.map(toToolDefinition);
  const toolCallsLog: any[] = [];
  const extractionIds: string[] = [];
  let assistantText = '';

  const turnResult = await adapter.streamCompletion({
    systemPrompt,
    messages: history,
    tools: toolDefs,
    onDelta: (delta) => {
      if (delta.type === 'text' && delta.text) {
        assistantText += delta.text;
        responseStream(`data: ${JSON.stringify({ type: 'delta', text: delta.text })}\n\n`);
      }
    },
    onToolCall: async (call) => {
      const tool = findTool(call.function.name);
      if (!tool) return JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
      if (!budget.canCall(call.function.name, tool.rateLimit)) {
        return JSON.stringify({ error: 'Tool budget exceeded' });
      }
      try {
        const args = JSON.parse(call.function.arguments);
        const result = await tool.execute(args, {
          userId: user.id, fsaCode, threadId, turnId, supabase,
        });
        budget.recordCall(call.function.name, result.costUsd ?? 0);
        toolCallsLog.push({ name: call.function.name, ok: result.ok, latencyMs: result.latencyMs });
        if (result.ok && result.data && (result.data as any).extraction_id) {
          extractionIds.push((result.data as any).extraction_id);
        }
        return JSON.stringify(result.data ?? { error: result.error });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });

  // Persist assistant message
  const { data: assistantMsg } = await supabase.from('chat_messages').insert({
    thread_id: threadId, user_id: user.id, role: 'assistant', content: assistantText,
  }).select('id').single();

  // Audit
  await logTurn(supabase, {
    turnId, threadId, userId: user.id,
    modelId, experimentId, variant,
    systemPromptHash: hashSystemPrompt(systemPrompt),
    systemPromptTokens: Math.ceil(systemPrompt.length / 4),  // rough estimate
    toolCallsLog, extractionIds,
    ...turnResult,
  } as any);

  responseStream(`data: ${JSON.stringify({ type: 'done', turnId })}\n\n`);
}

async function createThread(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from('chat_threads').insert({ user_id: userId }).select('id').single();
  return data.id;
}
```

**Commit:**

```bash
git add lib/bushy/harness.ts
git commit -m "feat(bushy): harness orchestrator (streams, tools, audit)"
```

---

### Task 6.5: API route `/api/bushy/chat`

**File:** `app/api/bushy/chat/route.ts` (create)

```typescript
import { getAuthenticatedUserContext } from '@/lib/auth/role-guard';
import { runChatTurn } from '@/lib/bushy/harness';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (role === 'observer') {
    return Response.json({ error: 'Chat is for farmers. Sign up to access Bushy.' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.message || typeof body.message !== 'string' || body.message.length === 0) {
    return Response.json({ error: 'Message is required' }, { status: 400 });
  }
  if (body.message.length > 2000) {
    return Response.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runChatTurn(
          { threadId: body.threadId, message: body.message, grainContext: body.grain ? { grain: body.grain, grainWeek: body.grainWeek } : undefined },
          user,
          (chunk) => controller.enqueue(new TextEncoder().encode(chunk))
        );
        controller.close();
      } catch (e: any) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

**Commit:**

```bash
git add app/api/bushy/chat/route.ts
git commit -m "feat(bushy): /api/bushy/chat SSE endpoint"
```

---

### Task 6.6: Smoke test the harness end-to-end

**Setup:**
```bash
# In .env.local: ANTHROPIC_API_KEY, SUPABASE_URL, etc.
npm run dev
```

**Test:**
```bash
curl -N -X POST http://localhost:3001/api/bushy/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth cookie from logged-in session>" \
  -d '{"message": "What is the wheat thesis this week?"}'
```

Expected: SSE stream of `data: {...delta...}` events ending with `data: {"type":"done","turnId":"..."}`.

**Verify in DB:**
```sql
SELECT model_id, prompt_tokens, completion_tokens, cost_usd, tool_call_count
FROM chat_turns_audit
ORDER BY created_at DESC LIMIT 1;
```

If anything fails: check Vercel function logs, check `chat_turns_audit.error_message`.

**Commit:** none — this is verification.

---

## Workstream 7: Reflection / Compression / Lessons

All four cron-driven jobs follow the same pattern: API route checks `BUSHY_CRON_SECRET` header, runs work, returns JSON status.

### Task 7.1: Cron auth helper

**File:** `lib/bushy/cron-auth.ts`

```typescript
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.BUSHY_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}
```

**Commit:**

```bash
git add lib/bushy/cron-auth.ts
git commit -m "feat(bushy): cron auth helper"
```

---

### Task 7.2: Daily reflection job

**Files:**
- Create: `lib/bushy/compression/reflect-daily.ts` — Opus 4.7 reads last 24h of extractions, generates structured report
- Create: `app/api/bushy/reflect/daily/route.ts` — Vercel Cron entrypoint

```typescript
// app/api/bushy/reflect/daily/route.ts
import { isAuthorizedCron } from '@/lib/bushy/cron-auth';
import { runDailyReflection } from '@/lib/bushy/compression/reflect-daily';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return new Response('Forbidden', { status: 403 });
  const result = await runDailyReflection();
  return Response.json(result);
}
```

**reflect-daily.ts** structure:
1. Read all `chat_extractions` from last 24h (where `extracted_at > now() - interval '1 day'`)
2. Group by category, summarize
3. Send to Opus 4.7 with the reflection prompt (see design doc Section 4)
4. Parse JSON output (markdown report + structured data)
5. INSERT into `nightly_reflections`
6. Send email via your existing email infrastructure (Resend? Slack webhook?) with subject like the design doc specifies

**Commit:**

```bash
git add lib/bushy/compression/reflect-daily.ts app/api/bushy/reflect/daily/route.ts
git commit -m "feat(bushy): daily reflection job (9 PM MST)"
```

---

### Task 7.3: Daily compression job

**Files:**
- Create: `lib/bushy/compression/compress-daily.ts`
- Create: `app/api/bushy/compress/daily/route.ts`

Reads extractions filtered by `review_status`, applies promotion/discard rules per design doc Section 4 (the table mapping `review_status` → compression behavior). Uses existing `knowledge_state` table.

**Commit:**

```bash
git add lib/bushy/compression/compress-daily.ts app/api/bushy/compress/daily/route.ts
git commit -m "feat(bushy): daily compression job (6 AM MST)"
```

---

### Task 7.4: Weekly compression job

**Files:**
- Create: `lib/bushy/compression/compress-weekly.ts`
- Create: `app/api/bushy/compress/weekly/route.ts`

Friday 6 AM. Extends daily compression with macro/micro reconciliation against `market_analysis` thesis. Generates `weekly_farmer_briefs` rows per active farmer.

**Commit:**

```bash
git add lib/bushy/compression/compress-weekly.ts app/api/bushy/compress/weekly/route.ts
git commit -m "feat(bushy): weekly compression job (Friday 6 AM MST)"
```

---

### Task 7.5: Sunday lesson generation job

**Files:**
- Create: `lib/bushy/compression/learn-weekly.ts`
- Create: `app/api/bushy/lessons/weekly/route.ts`

Sunday 2 AM. Reads last 7 days of `nightly_reflections` + `chat_extractions.review_status`. Opus 4.7 finds patterns ("18/23 input_cost discards were hypothetical") and authors candidate lessons. INSERT into `extraction_lessons` with `confidence=70, status='active'`.

**Commit:**

```bash
git add lib/bushy/compression/learn-weekly.ts app/api/bushy/lessons/weekly/route.ts
git commit -m "feat(bushy): weekly lesson generation (Sunday 2 AM MST)"
```

---

### Task 7.6: Vercel cron config

**File:** `vercel.json` (modify or create)

```json
{
  "crons": [
    { "path": "/api/bushy/reflect/daily",  "schedule": "0 4 * * *" },
    { "path": "/api/bushy/compress/daily", "schedule": "0 13 * * *" },
    { "path": "/api/bushy/compress/weekly","schedule": "0 13 * * 5" },
    { "path": "/api/bushy/lessons/weekly", "schedule": "0 9 * * 0" },
    { "path": "/api/bushy/eval/sample",    "schedule": "0 6 * * *" }
  ]
}
```

(Note: Vercel Cron runs in UTC. 9 PM MST = 04:00 UTC next day; 6 AM MST = 13:00 UTC. Friday 6 AM MST = 13:00 UTC Friday. Sunday 2 AM MST = 09:00 UTC Sunday. 11 PM MST = 06:00 UTC next day.)

**Commit:**

```bash
git add vercel.json
git commit -m "feat(bushy): Vercel Cron schedule for all 5 jobs"
```

---

## Workstream 8: Audit + Alerts + Evals

### Task 8.1: Anomaly detector + alert writer

**File:** `lib/bushy/audit/alerts.ts`

After every chat turn, check thresholds:
- Error rate > 10% in last 30 min → CRIT alert + auto-pause active experiment
- Single user costs > $5 in last 24h → HIGH alert
- Tool error rate > 20% over last hour → MED + disable tool

Implement as a function called at the end of `runChatTurn`. Or run as separate hourly cron — either works. Hourly cron is simpler.

**Commit:**

```bash
git add lib/bushy/audit/alerts.ts
git commit -m "feat(bushy): anomaly detection + chat_alerts writer"
```

---

### Task 8.2: Sample audit job

**Files:**
- Create: `lib/bushy/eval/sample-audit.ts`
- Create: `app/api/bushy/eval/sample/route.ts`

Daily 11 PM MST. Selects 5% random sample from yesterday's `chat_turns_audit`. For each, fetches the original message + response, sends to Opus 4.7 with the rubric prompt. Inserts scores into `chat_quality_evals`.

Eval prompt outline:

> Score this Bushy chat exchange on warmth (0-100), brevity, accuracy, persona_fidelity, helpfulness. Persona: Bushy is a prairie farming buddy — warm, dry humor, calibrated questions, never corporate-speak. Identify failure modes from this list: corporate_tone, over_long, dodged_question, hallucinated_data, wrong_persona.

**Commit:**

```bash
git add lib/bushy/eval/sample-audit.ts app/api/bushy/eval/sample/route.ts
git commit -m "feat(bushy): daily sample audit eval job"
```

---

### Task 8.3: Persona eval suite

**Files:**
- Create: `eval/persona-suite.yaml` — ~30 test prompts with rubric criteria
- Create: `scripts/eval-persona.ts` — runner

```yaml
# eval/persona-suite.yaml
- prompt: "I think your wheat call last week was complete bullshit"
  expects:
    tone: warm
    structure: ends_with_calibrated_question
    avoids: ["I apologize", "I'm sorry you feel"]
    includes_one_of: ["how am I", "what about", "tell me more"]

- prompt: "Hi"
  expects:
    length_under: 60
    includes_one_of: ["how's it going", "what's on your mind", "anything I can pull up"]

- prompt: "Write me a poem about wheat"
  expects:
    tone: warm
    structure: cost_aware_reframe
    includes_one_of: ["costs real money", "not the best use", "what's bushy good for"]
    avoids: ["roses are red", "ode to"]

# ... 27 more
```

**Runner:** `npx tsx scripts/eval-persona.ts --model claude-sonnet-4.6` runs all prompts, scores via Opus 4.7, writes a Markdown report to `eval/results/{timestamp}-{model}.md`.

**Add npm script:**
```json
"eval:persona": "npx tsx scripts/eval-persona.ts"
```

**Commit:**

```bash
git add eval/persona-suite.yaml scripts/eval-persona.ts package.json
git commit -m "feat(bushy): persona eval suite + runner"
```

---

## Workstream 9: Admin UIs

### Task 9.1: Reflection review page

**Files:**
- Create: `app/(admin)/admin/reflection/[date]/page.tsx`
- Create: `app/(admin)/admin/reflection/[date]/actions.ts` — server actions for keep/discard

Layout per design doc Section 4. Fetches `nightly_reflections.report_json` for the date, renders per-category groups with two-button decision UI. Server action writes to `chat_extractions.review_status`.

Auth: gated by `role='admin'` check at server-side via `getAuthenticatedUserContext`.

**Commit:**

```bash
git add app/(admin)/admin/reflection/
git commit -m "feat(bushy): /admin/reflection/[date] review UI"
```

---

### Task 9.2: Cost dashboard

**File:** `app/(admin)/admin/spend/page.tsx`

Query `v_chat_daily_health`, `v_model_performance_7d`, `v_cost_alerts`. Render the spend layout from design doc Section 6.

**Commit:**

```bash
git add app/(admin)/admin/spend/
git commit -m "feat(bushy): /admin/spend dashboard"
```

---

## Workstream 10: Migration / Cutover

### Task 10.1: Shadow-mode flag

Add a feature flag (env var) `BUSHY_SHADOW_MODE=true` that runs the harness on every request alongside the existing `chat-completion` Edge Function call, but discards the harness response (only writes audit row). This lets you validate the audit pipeline against real traffic before serving any of it.

**File:** `app/api/advisor/chat/route.ts` (modify) — add the shadow call before returning.

**Commit:**

```bash
git add app/api/advisor/chat/route.ts
git commit -m "feat(bushy): shadow-mode flag for audit pipeline validation"
```

---

### Task 10.2: 24-hour shadow validation

**Manual checklist:**
1. Deploy to production with `BUSHY_SHADOW_MODE=true`
2. Wait 24 hours
3. Run:
   ```sql
   SELECT
     COUNT(*) AS turns,
     SUM(CASE WHEN finish_reason='error' THEN 1 ELSE 0 END) AS errors,
     AVG(cost_usd) AS avg_cost,
     AVG(latency_total_ms) AS avg_latency
   FROM chat_turns_audit
   WHERE created_at > now() - interval '24 hours';
   ```
4. Verify audit rows exist for ~all real chats from last 24h
5. Verify error rate <5%, latency p95 <30s, no NULL critical fields

If checks pass → proceed to Task 10.3. If not → debug and re-run shadow for another 24h.

---

### Task 10.3: 10% traffic cutover

Modify the chat route to: with 10% probability per user (deterministic by hash), send to the harness instead of the Edge Function. Keep both paths instrumented.

After 48h, compare:
- Error rate (harness vs Edge Function)
- Cost per turn
- Latency p95

If harness is within 1.2× Edge Function on all dimensions → proceed.

**Commit:**

```bash
git add app/api/advisor/chat/route.ts
git commit -m "feat(bushy): 10% traffic cutover to harness"
```

---

### Task 10.4: 100% promotion

Remove the routing condition; all traffic goes to harness.

**Commit:**

```bash
git add app/api/advisor/chat/route.ts
git commit -m "feat(bushy): 100% traffic on harness"
```

---

### Task 10.5: Edge Function deprecation

Once 100% has run for 7 days with no incidents:
1. Remove the Edge Function from `supabase/functions/chat-completion/`
2. Remove the supabase deployment: `npx supabase functions delete chat-completion`
3. Remove `HERMES_URL` env var references from `app/api/advisor/chat/route.ts`
4. Update CLAUDE.md to reflect new architecture

**Commit:**

```bash
git rm -r supabase/functions/chat-completion/
git add CLAUDE.md app/api/advisor/chat/route.ts
git commit -m "refactor(bushy): deprecate chat-completion Edge Function"
```

---

## Final Verification Checklist

After WS10 completes:

- [ ] `chat_turns_audit` row exists for every conversation turn in the last 24h
- [ ] `nightly_reflections` row exists for each day in the last 7
- [ ] `compression_summaries` row exists for each daily + weekly job
- [ ] `extraction_lessons` has at least 3 active rows after 2 weeks
- [ ] `chat_quality_evals` has rows from sample-audit job
- [ ] `v_chat_daily_health` shows error rate <5%
- [ ] `v_model_performance_7d` shows current model
- [ ] `/admin/reflection/[yesterday]` renders and accepts decisions
- [ ] `/admin/spend` shows accurate monthly total
- [ ] No errors in Vercel logs for cron routes
- [ ] CLAUDE.md updated to reflect new architecture
- [ ] `STATUS.md` track entry added for "Bushy Chat Harness"

---

## What This Plan Deliberately Doesn't Cover

- **iOS app changes** — the existing iOS app continues to call `/api/advisor/chat`; that route continues to work post-cutover (it just routes through the harness now). iOS-specific changes are a separate plan.
- **MCP server integration** — `MCP_SERVERS` array is empty at launch; adding firecrawl etc. is a separate workstream once audit shows a real gap.
- **Multi-armed bandit auto-promotion** — A/B promotion stays manual.
- **Voice fine-tuning** — would lock model choice; not at launch.
- **Per-region voice variants** — fragments persona identity.

These are documented in the design doc's "What we deliberately defer" section.

---

## Reference Skills

- `superpowers:executing-plans` — execute this plan task by task
- `superpowers:test-driven-development` — for tasks with test-first patterns
- `superpowers:subagent-driven-development` — if dispatching workstreams to parallel agents
- `superpowers:verification-before-completion` — gate task completion on verify-first
- `engineering:debug` — when smoke tests fail
- `data:write-query` — for the SQL verification steps

---

**Total estimated tasks:** ~50 across 10 workstreams.
**Estimated effort:** 3-5 days for one engineer doing all workstreams sequentially. 1-2 days if WS2-5 run in parallel.
**Critical path:** WS0 → WS1 → WS6 → WS10. Everything else can parallelize.
