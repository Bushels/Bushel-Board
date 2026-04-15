# Hermes Chat Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the stateless `chat-completion` Edge Function with Hermes — a persistent chat agent on GCP VM with tiered memory (Ephemeral → Working Memory → Long-term Patterns), supersession-based data aging, daily/weekly compression, and direct X API v2 integration.

**Architecture:** Hermes runs as a persistent Node.js process on the existing GCP VM (`hermes-agent`, `us-central1-a`). Vercel API route proxies farmer messages to Hermes via HTTP. All state persists in Supabase — Hermes is stateless on crash recovery. Three-tier memory with daily compression (10 PM MST) and weekly compression (Friday 9 PM MST) that merges local intelligence with the national bullish/bearish thesis.

**Tech Stack:** Node.js/TypeScript on GCP VM, Supabase (PostgreSQL + RLS), xAI Responses API (Grok), X API v2 (Bearer Token), Vitest for tests.

**Design Doc:** `docs/plans/2026-04-15-hermes-chat-agent-design.md`

---

## Task 1: Database Migrations — Tiered Memory Tables

**Files:**
- Create: `supabase/migrations/20260416010000_create_chat_extractions.sql`
- Create: `supabase/migrations/20260416020000_create_knowledge_state.sql`
- Create: `supabase/migrations/20260416030000_create_knowledge_patterns.sql`
- Create: `supabase/migrations/20260416040000_create_compression_summaries.sql`
- Create: `supabase/migrations/20260416050000_create_weekly_farmer_briefs.sql`
- Create: `supabase/migrations/20260416060000_create_x_api_query_log.sql`

**Step 1: Write `chat_extractions` migration**

```sql
-- Tier 1: Ephemeral Extractions
-- Raw data points Hermes notices during conversations, unvalidated.
-- Processed during end-of-day compression.

CREATE TABLE IF NOT EXISTS chat_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  thread_id uuid NOT NULL REFERENCES chat_threads(id),
  message_id uuid NOT NULL REFERENCES chat_messages(id),
  fsa_code text NOT NULL CHECK (fsa_code ~ '^[A-Z][0-9][A-Z]$'),
  category text NOT NULL CHECK (category IN (
    'market', 'agronomic', 'weather', 'intent', 'logistics', 'input_cost'
  )),
  data_type text NOT NULL,
  grain text,
  value_numeric numeric,
  value_text text,
  location_detail text,
  confidence text NOT NULL DEFAULT 'reported' CHECK (confidence IN ('reported', 'inferred')),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  promoted boolean NOT NULL DEFAULT false,
  discarded boolean NOT NULL DEFAULT false,
  discard_reason text,

  CONSTRAINT has_value CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

-- Indexes for compression queries
CREATE INDEX idx_extractions_unprocessed
  ON chat_extractions (extracted_at DESC)
  WHERE promoted = false AND discarded = false;

CREATE INDEX idx_extractions_user_grain
  ON chat_extractions (user_id, grain, category, extracted_at DESC);

CREATE INDEX idx_extractions_fsa_category
  ON chat_extractions (fsa_code, category, data_type, extracted_at DESC);

-- RLS: service role only (Hermes writes via service key)
ALTER TABLE chat_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chat_extractions"
  ON chat_extractions FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 2: Write `knowledge_state` migration**

```sql
-- Tier 2: Working Memory
-- What Hermes currently believes to be true.
-- Promoted from ephemeral, superseded when contradicted.

CREATE TABLE IF NOT EXISTS knowledge_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fsa_code text NOT NULL CHECK (fsa_code ~ '^[A-Z][0-9][A-Z]$'),
  category text NOT NULL CHECK (category IN (
    'market', 'agronomic', 'weather', 'intent', 'logistics', 'input_cost'
  )),
  data_type text NOT NULL,
  grain text,
  value_numeric numeric,
  value_text text,
  location_detail text,
  source_count int NOT NULL DEFAULT 1,
  confidence_level text NOT NULL DEFAULT 'single_report'
    CHECK (confidence_level IN ('single_report', 'corroborated', 'consensus')),
  first_reported_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'expired')),
  superseded_by uuid REFERENCES knowledge_state(id),
  supersession_reason text,
  source_extraction_ids uuid[] NOT NULL DEFAULT '{}',

  CONSTRAINT has_value CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

-- Primary lookup: active beliefs for an area
CREATE INDEX idx_knowledge_active
  ON knowledge_state (fsa_code, category, data_type, grain)
  WHERE status = 'active';

-- Supersession audit trail
CREATE INDEX idx_knowledge_superseded
  ON knowledge_state (superseded_by)
  WHERE status = 'superseded';

-- Grain-specific lookups
CREATE INDEX idx_knowledge_grain
  ON knowledge_state (grain, category, status, last_updated_at DESC)
  WHERE grain IS NOT NULL;

ALTER TABLE knowledge_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on knowledge_state"
  ON knowledge_state FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 3: Write `knowledge_patterns` migration**

```sql
-- Tier 3: Long-Term Memory
-- Trends, patterns, and historical context detected over time.

CREATE TABLE IF NOT EXISTS knowledge_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fsa_code text,
  pattern_type text NOT NULL CHECK (pattern_type IN (
    'trend', 'seasonal', 'correlation', 'anomaly', 'area_shift'
  )),
  category text NOT NULL,
  grain text,
  title text NOT NULL,
  description text NOT NULL,
  supporting_data jsonb NOT NULL DEFAULT '[]',
  confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invalidated', 'archived')),
  season text CHECK (season IS NULL OR season IN (
    'seeding', 'growing', 'harvest', 'marketing'
  ))
);

CREATE INDEX idx_patterns_active
  ON knowledge_patterns (fsa_code, category, grain)
  WHERE status = 'active';

CREATE INDEX idx_patterns_type
  ON knowledge_patterns (pattern_type, status, detected_at DESC);

ALTER TABLE knowledge_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on knowledge_patterns"
  ON knowledge_patterns FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 4: Write `compression_summaries` migration**

```sql
-- Compression cycle output — daily and weekly audit logs.

CREATE TABLE IF NOT EXISTS compression_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period IN ('daily', 'weekly')),
  compression_date date NOT NULL,
  conversations_processed int NOT NULL DEFAULT 0,
  extractions_total int NOT NULL DEFAULT 0,
  promoted int NOT NULL DEFAULT 0,
  corroborated int NOT NULL DEFAULT 0,
  superseded int NOT NULL DEFAULT 0,
  discarded int NOT NULL DEFAULT 0,
  deferred int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}',
  patterns_detected int NOT NULL DEFAULT 0,
  flags_for_review int NOT NULL DEFAULT 0,
  macro_micro_alignment jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_period_date UNIQUE (period, compression_date)
);

CREATE INDEX idx_compression_recent
  ON compression_summaries (period, compression_date DESC);

ALTER TABLE compression_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on compression_summaries"
  ON compression_summaries FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 5: Write `weekly_farmer_briefs` migration**

```sql
-- Per-farmer weekly intelligence merging macro thesis + local data.

CREATE TABLE IF NOT EXISTS weekly_farmer_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  fsa_code text NOT NULL,
  week_ending date NOT NULL,
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  grains_covered text[] NOT NULL DEFAULT '{}',
  macro_micro_alignment jsonb NOT NULL DEFAULT '{}',
  personal_insights jsonb NOT NULL DEFAULT '[]',
  area_intelligence_summary text,
  weather_context text,
  recommended_actions jsonb NOT NULL DEFAULT '[]',
  pipeline_stance_scores jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_user_week UNIQUE (user_id, week_ending)
);

CREATE INDEX idx_briefs_user
  ON weekly_farmer_briefs (user_id, week_ending DESC);

ALTER TABLE weekly_farmer_briefs ENABLE ROW LEVEL SECURITY;

-- Farmers can read their own briefs
CREATE POLICY "Users can read own briefs"
  ON weekly_farmer_briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on weekly_farmer_briefs"
  ON weekly_farmer_briefs FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 6: Write `x_api_query_log` migration**

```sql
-- X API call tracking for deduplication and budget optimization.

CREATE TABLE IF NOT EXISTS x_api_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  query_hash text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('background', 'chat_realtime')),
  triggered_by_user uuid REFERENCES auth.users(id),
  tweets_returned int NOT NULL DEFAULT 0,
  tweets_relevant int NOT NULL DEFAULT 0,
  extractions_created int NOT NULL DEFAULT 0,
  value_score smallint CHECK (value_score IS NULL OR value_score BETWEEN 0 AND 100),
  searched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_xapi_dedup
  ON x_api_query_log (query_hash, searched_at DESC);

CREATE INDEX idx_xapi_budget
  ON x_api_query_log (mode, searched_at DESC);

ALTER TABLE x_api_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on x_api_query_log"
  ON x_api_query_log FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 7: Apply migrations**

Run: `npx supabase db push`
Expected: All 6 migrations applied successfully.

**Step 8: Verify tables exist**

Run via Supabase SQL editor or `execute_sql`:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'chat_extractions', 'knowledge_state', 'knowledge_patterns',
  'compression_summaries', 'weekly_farmer_briefs', 'x_api_query_log'
)
ORDER BY table_name;
```
Expected: 6 rows returned.

**Step 9: Commit**

```bash
git add supabase/migrations/202604160*.sql
git commit -m "feat: tiered memory tables — chat_extractions, knowledge_state, knowledge_patterns, compression_summaries, weekly_farmer_briefs, x_api_query_log"
```

---

## Task 2: Knowledge Engine — Classification & Extraction

The module that classifies conversation messages and creates ephemeral extractions.

**Files:**
- Create: `supabase/functions/_shared/knowledge-engine.ts`
- Create: `tests/lib/knowledge-engine.test.ts`

**Step 1: Write the failing test**

Create `tests/lib/knowledge-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  classifyMessage,
  type ExtractionCandidate,
} from '@/lib/knowledge/classification';

describe('classifyMessage', () => {
  it('extracts basis report with numeric value', () => {
    const result = classifyMessage(
      'Canola basis at Viterra Weyburn is -42 under today',
      { grain: 'Canola', fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'market',
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -42,
      location_detail: 'Viterra Weyburn',
      confidence: 'reported',
    });
  });

  it('extracts intent signal from rotation mention', () => {
    const result = classifyMessage(
      "I'm thinking about switching to lentils next year",
      { grain: null, fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'intent',
      data_type: 'rotation_plan',
      grain: 'Lentils',
      value_text: expect.stringContaining('lentils'),
      confidence: 'reported',
    });
  });

  it('extracts weather observation', () => {
    const result = classifyMessage(
      'Got 2 inches of rain last night',
      { grain: null, fsa_code: 'T0L' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'weather',
      data_type: 'precipitation',
      value_numeric: 2,
      confidence: 'reported',
    });
  });

  it('returns empty array for non-farming chatter', () => {
    const result = classifyMessage(
      'My dog ate the tractor manual',
      { grain: null, fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(0);
  });

  it('extracts multiple data points from one message', () => {
    const result = classifyMessage(
      'Finished seeding 800 acres of wheat, yield looking like 45 bushels',
      { grain: 'Wheat', fsa_code: 'S0A' }
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    const types = result.map((r) => r.data_type);
    expect(types).toContain('seeding_progress');
    expect(types).toContain('yield_estimate');
  });

  it('extracts input cost data', () => {
    const result = classifyMessage(
      'Urea is $780 per tonne at the co-op',
      { grain: null, fsa_code: 'T0K' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'input_cost',
      data_type: 'fertilizer_price',
      value_numeric: 780,
      confidence: 'reported',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/knowledge-engine.test.ts`
Expected: FAIL — module `@/lib/knowledge/classification` not found.

**Step 3: Write classification module**

Create `lib/knowledge/classification.ts`:

```typescript
/**
 * Knowledge Engine — Classification & Extraction
 *
 * Classifies farmer chat messages into structured data extractions.
 * This runs inside Hermes (server-side only) during conversation.
 *
 * NOTE: This module provides the TYPE SYSTEM and PATTERN MATCHING logic.
 * Hermes uses this as a first-pass classifier, then uses LLM reasoning
 * for ambiguous cases. Simple pattern matches (basis = -42) are handled
 * here; complex intent detection is delegated to the LLM.
 */

export interface ExtractionCandidate {
  category: 'market' | 'agronomic' | 'weather' | 'intent' | 'logistics' | 'input_cost';
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  confidence: 'reported' | 'inferred';
}

interface MessageContext {
  grain: string | null;
  fsa_code: string;
}

const GRAIN_NAMES = [
  'Wheat', 'Canola', 'Barley', 'Oats', 'Flax', 'Lentils', 'Peas',
  'Soybeans', 'Mustard', 'Rye', 'Canaryseed', 'Corn', 'Sunflower',
  'Chickpeas', 'Fababeans', 'Triticale',
];

const GRAIN_PATTERN = new RegExp(
  `\\b(${GRAIN_NAMES.join('|')})\\b`, 'i'
);

// --- Pattern matchers ---

function extractBasis(msg: string, ctx: MessageContext): ExtractionCandidate | null {
  // Matches: "basis is -42", "basis at Viterra is -42 under", "-42 basis"
  const basisMatch = msg.match(
    /basis\b.*?(?:at|@)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+.*?(-?\d+)/i
  ) || msg.match(/basis\b.*?(-?\d+)/i);

  if (!basisMatch) return null;

  const hasLocation = basisMatch.length === 3;
  return {
    category: 'market',
    data_type: 'basis',
    grain: detectGrain(msg, ctx),
    value_numeric: Number(hasLocation ? basisMatch[2] : basisMatch[1]),
    value_text: null,
    location_detail: hasLocation ? basisMatch[1] : null,
    confidence: 'reported',
  };
}

function extractPrice(msg: string, ctx: MessageContext): ExtractionCandidate | null {
  // Matches: "$14.20 for canola", "offering $14.20", "price is $780/tonne"
  const priceMatch = msg.match(/\$(\d+(?:\.\d+)?)\s*(?:\/|\s*per\s*)(tonne|bushel|bu|acre|lb)/i);
  if (!priceMatch) {
    const simplePrice = msg.match(/(?:offering|price|paying|at)\s+\$(\d+(?:\.\d+)?)/i);
    if (!simplePrice) return null;
    return {
      category: 'market',
      data_type: 'cash_price',
      grain: detectGrain(msg, ctx),
      value_numeric: Number(simplePrice[1]),
      value_text: null,
      location_detail: extractElevatorName(msg),
      confidence: 'reported',
    };
  }

  const unit = priceMatch[2].toLowerCase();
  const isFertilizer = /urea|phosphate|potash|fertilizer|anhydrous/i.test(msg);
  const isChemical = /glyphosate|herbicide|fungicide|insecticide|chemical/i.test(msg);
  const isSeed = /seed\s+cost|seed\s+price|per\s+lb/i.test(msg);
  const isFuel = /diesel|gas|fuel|cardlock/i.test(msg);
  const isCustom = /spraying|combining|custom|swathing/i.test(msg);

  if (isFertilizer) {
    return {
      category: 'input_cost', data_type: 'fertilizer_price',
      grain: null, value_numeric: Number(priceMatch[1]),
      value_text: `${priceMatch[1]}/${priceMatch[2]}`,
      location_detail: null, confidence: 'reported',
    };
  }
  if (isChemical) {
    return {
      category: 'input_cost', data_type: 'chemical_price',
      grain: null, value_numeric: Number(priceMatch[1]),
      value_text: `${priceMatch[1]}/${priceMatch[2]}`,
      location_detail: null, confidence: 'reported',
    };
  }
  if (isSeed) {
    return {
      category: 'input_cost', data_type: 'seed_cost',
      grain: detectGrain(msg, ctx), value_numeric: Number(priceMatch[1]),
      value_text: `${priceMatch[1]}/${priceMatch[2]}`,
      location_detail: null, confidence: 'reported',
    };
  }
  if (isFuel) {
    return {
      category: 'input_cost', data_type: 'fuel_price',
      grain: null, value_numeric: Number(priceMatch[1]),
      value_text: `${priceMatch[1]}/${priceMatch[2]}`,
      location_detail: null, confidence: 'reported',
    };
  }
  if (isCustom) {
    return {
      category: 'input_cost', data_type: 'custom_work_rate',
      grain: null, value_numeric: Number(priceMatch[1]),
      value_text: `${priceMatch[1]}/${priceMatch[2]}`,
      location_detail: null, confidence: 'reported',
    };
  }

  return {
    category: 'market',
    data_type: unit === 'tonne' || unit === 'bushel' || unit === 'bu' ? 'cash_price' : 'cash_price',
    grain: detectGrain(msg, ctx),
    value_numeric: Number(priceMatch[1]),
    value_text: `${priceMatch[1]}/${priceMatch[2]}`,
    location_detail: extractElevatorName(msg),
    confidence: 'reported',
  };
}

function extractWeather(msg: string, _ctx: MessageContext): ExtractionCandidate | null {
  // Precipitation
  const rainMatch = msg.match(/(\d+(?:\.\d+)?)\s*(?:inch|inches|in|mm|cm)\s*(?:of\s+)?(?:rain|snow|precip|moisture)/i)
    || msg.match(/(?:got|received|had)\s+(\d+(?:\.\d+)?)\s*(?:inch|inches|in|mm)/i);
  if (rainMatch) {
    return {
      category: 'weather', data_type: 'precipitation',
      grain: null, value_numeric: Number(rainMatch[1]),
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  // Frost
  const frostMatch = msg.match(/frost|froze|freeze|hit\s+(-?\d+)/i);
  if (frostMatch) {
    const temp = msg.match(/(-?\d+)\s*(?:degrees|°|C)/i);
    return {
      category: 'weather', data_type: 'frost_event',
      grain: null, value_numeric: temp ? Number(temp[1]) : null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  // Drought
  if (/drought|dry\s+(?:for|spell|conditions)|haven'?t\s+had\s+rain/i.test(msg)) {
    return {
      category: 'weather', data_type: 'drought_observation',
      grain: null, value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  // Heat
  if (/heat\s*(?:wave|stress|warning)|over\s+3[0-9]\s*(?:degrees|°)/i.test(msg)) {
    const temp = msg.match(/(\d+)\s*(?:degrees|°)/i);
    return {
      category: 'weather', data_type: 'heat_stress',
      grain: null, value_numeric: temp ? Number(temp[1]) : null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  return null;
}

function extractAgronomic(msg: string, ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];

  // Seeding progress
  const seedMatch = msg.match(/(?:seeded|planted|put\s+in|finished\s+seeding)\s+(\d+)\s*(?:acres|ac)/i);
  if (seedMatch) {
    results.push({
      category: 'agronomic', data_type: 'seeding_progress',
      grain: detectGrain(msg, ctx), value_numeric: Number(seedMatch[1]),
      value_text: null, location_detail: null, confidence: 'reported',
    });
  }

  // Yield estimate
  const yieldMatch = msg.match(/(\d+(?:\.\d+)?)\s*(?:bu(?:shels?)?|bushels?\s*(?:per|\/)\s*acre)/i)
    || msg.match(/yield\s+.*?(\d+(?:\.\d+)?)/i);
  if (yieldMatch) {
    results.push({
      category: 'agronomic', data_type: 'yield_estimate',
      grain: detectGrain(msg, ctx), value_numeric: Number(yieldMatch[1]),
      value_text: null, location_detail: null, confidence: 'reported',
    });
  }

  // Crop condition
  if (/crop\s+(?:looks?|condition|health)|(?:thin|thick)\s+stand|stressed|struggling/i.test(msg)) {
    results.push({
      category: 'agronomic', data_type: 'crop_condition',
      grain: detectGrain(msg, ctx), value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    });
  }

  // Pest/disease
  if (/flea\s*beetle|grasshopper|aphid|sclerotinia|fusarium|blackleg|midge|pest|disease|insect/i.test(msg)) {
    results.push({
      category: 'agronomic', data_type: 'pest_disease',
      grain: detectGrain(msg, ctx), value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    });
  }

  // Acres
  const acresMatch = msg.match(/(\d+)\s*(?:acres|ac)\s+(?:of\s+)?(\w+)/i);
  if (acresMatch && !seedMatch) {
    results.push({
      category: 'agronomic', data_type: 'acres',
      grain: detectGrain(msg, ctx) || capitalize(acresMatch[2]),
      value_numeric: Number(acresMatch[1]),
      value_text: null, location_detail: null, confidence: 'reported',
    });
  }

  return results;
}

function extractIntent(msg: string, ctx: MessageContext): ExtractionCandidate | null {
  // Rotation plan
  if (/(?:thinking|considering|planning|switch(?:ing)?|moving)\s+(?:about\s+)?(?:to\s+|into\s+)?(\w+)/i.test(msg)
    && /lentils?|peas?|canola|wheat|barley|flax|mustard|soybeans?|oats?|corn/i.test(msg)) {
    const grain = detectGrain(msg, ctx);
    return {
      category: 'intent', data_type: 'rotation_plan',
      grain, value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  // Marketing plan
  if (/(?:going\s+to|plan\s+to|gonna)\s+(?:hold|sell|market|deliver|store|wait)/i.test(msg)) {
    return {
      category: 'intent', data_type: 'marketing_plan',
      grain: detectGrain(msg, ctx), value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  // Expansion/contraction
  if (/(?:cutting|reducing|increasing|adding|dropping|expanding)\s+.*?(?:acres|acreage)/i.test(msg)) {
    return {
      category: 'intent', data_type: 'expansion_contraction',
      grain: detectGrain(msg, ctx), value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  return null;
}

function extractLogistics(msg: string, _ctx: MessageContext): ExtractionCandidate | null {
  // Wait time
  const waitMatch = msg.match(/(\d+)\s*(?:hour|hr)s?\s+(?:wait|line|lineup)/i);
  if (waitMatch) {
    return {
      category: 'logistics', data_type: 'elevator_wait_time',
      grain: null, value_numeric: Number(waitMatch[1]),
      value_text: null, location_detail: extractElevatorName(msg),
      confidence: 'reported',
    };
  }

  // Elevator capacity
  if (/(?:elevator|terminal)\s+.*?(?:full|not\s+(?:taking|accepting|booking))/i.test(msg)) {
    return {
      category: 'logistics', data_type: 'elevator_capacity',
      grain: null, value_numeric: null,
      value_text: msg, location_detail: extractElevatorName(msg),
      confidence: 'reported',
    };
  }

  // Trucking
  if (/(?:can'?t|hard\s+to)\s+find\s+(?:a\s+)?truck/i.test(msg)) {
    return {
      category: 'logistics', data_type: 'trucking_availability',
      grain: null, value_numeric: null,
      value_text: msg, location_detail: null, confidence: 'reported',
    };
  }

  return null;
}

// --- Helpers ---

function detectGrain(msg: string, ctx: MessageContext): string | null {
  const match = msg.match(GRAIN_PATTERN);
  if (match) return capitalize(match[1]);
  return ctx.grain;
}

function extractElevatorName(msg: string): string | null {
  const companies = [
    'Viterra', 'Richardson', 'Cargill', 'G3', 'Parrish & Heimbecker',
    'P&H', 'AGT', 'Bunge', 'LDC', 'Louis Dreyfus',
  ];
  for (const co of companies) {
    if (msg.toLowerCase().includes(co.toLowerCase())) {
      // Try to get location too: "Viterra Weyburn"
      const pattern = new RegExp(`${co}\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`, 'i');
      const locMatch = msg.match(pattern);
      return locMatch ? `${co} ${locMatch[1]}` : co;
    }
  }
  // Check for "co-op", "the elevator"
  if (/\bco-?op\b/i.test(msg)) return 'Co-op';
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// --- Main classifier ---

export function classifyMessage(
  message: string,
  context: MessageContext
): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];

  // Run all extractors
  const basis = extractBasis(message, context);
  if (basis) results.push(basis);

  const price = extractPrice(message, context);
  if (price && !basis) results.push(price); // avoid double-counting basis as price

  const weather = extractWeather(message, context);
  if (weather) results.push(weather);

  const agronomic = extractAgronomic(message, context);
  results.push(...agronomic);

  const intent = extractIntent(message, context);
  if (intent) results.push(intent);

  const logistics = extractLogistics(message, context);
  if (logistics) results.push(logistics);

  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/knowledge-engine.test.ts`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add lib/knowledge/classification.ts tests/lib/knowledge-engine.test.ts
git commit -m "feat: knowledge classification engine with pattern matchers for 6 farming categories"
```

---

## Task 3: Supersession Engine

The module that decides when new data replaces old in working memory.

**Files:**
- Create: `lib/knowledge/supersession.ts`
- Create: `tests/lib/supersession.test.ts`

**Step 1: Write the failing test**

Create `tests/lib/supersession.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  shouldSupersede,
  type SupersessionDecision,
  type KnowledgeEntry,
} from '@/lib/knowledge/supersession';

const makeEntry = (overrides: Partial<KnowledgeEntry>): KnowledgeEntry => ({
  id: 'existing-1',
  fsa_code: 'S0A',
  category: 'market',
  data_type: 'basis',
  grain: 'Canola',
  value_numeric: -42,
  value_text: null,
  location_detail: 'Viterra Weyburn',
  source_count: 1,
  confidence_level: 'single_report',
  status: 'active',
  last_updated_at: new Date('2026-04-10'),
  ...overrides,
});

describe('shouldSupersede', () => {
  it('supersedes same location with newer price — direct contradiction', () => {
    const existing = makeEntry({});
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -38,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };

    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('supersede');
    expect(decision.confidence).toBe('high');
    expect(decision.decision_type).toBe('direct_contradiction');
  });

  it('corroborates when different source reports similar value', () => {
    const existing = makeEntry({ value_numeric: -42 });
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -41,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };

    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('corroborate');
  });

  it('flags conflicting values for review', () => {
    const existing = makeEntry({ value_numeric: -42 });
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -28,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };

    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('flag_for_review');
    expect(decision.confidence).toBe('low');
  });

  it('supersedes weather aggressively', () => {
    const existing = makeEntry({
      category: 'weather',
      data_type: 'precipitation',
      value_numeric: 2,
      value_text: 'Got 2 inches of rain',
      last_updated_at: new Date('2026-04-12'),
    });
    const incoming = {
      category: 'weather' as const,
      data_type: 'drought_observation',
      grain: null,
      value_numeric: null,
      value_text: 'Been dry since that rain',
      location_detail: null,
      fsa_code: 'S0A',
    };

    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('supersede');
    expect(decision.decision_type).toBe('progression');
  });

  it('does NOT supersede intent without explicit change', () => {
    const existing = makeEntry({
      category: 'intent',
      data_type: 'rotation_plan',
      value_text: 'thinking about lentils',
      grain: 'Lentils',
    });
    const incoming = {
      category: 'agronomic' as const,
      data_type: 'seeding_progress',
      grain: 'Wheat',
      value_numeric: 500,
      value_text: null,
      location_detail: null,
      fsa_code: 'S0A',
    };

    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('no_match');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/supersession.test.ts`
Expected: FAIL — module not found.

**Step 3: Write supersession engine**

Create `lib/knowledge/supersession.ts`:

```typescript
/**
 * Supersession Engine
 *
 * Decides when new data should replace existing working memory.
 * Rules vary by category (market, weather, intent, etc.).
 */

export interface KnowledgeEntry {
  id: string;
  fsa_code: string;
  category: string;
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  source_count: number;
  confidence_level: string;
  status: string;
  last_updated_at: Date;
}

export interface IncomingData {
  category: string;
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  fsa_code: string;
}

export interface SupersessionDecision {
  action: 'supersede' | 'corroborate' | 'flag_for_review' | 'no_match';
  decision_type: 'direct_contradiction' | 'progression' | 'corroboration_upgrade' | 'context_staleness' | 'none';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Determines if incoming data should supersede an existing knowledge entry.
 *
 * Returns a decision with action, confidence, and reason.
 * The caller (Hermes) acts on high-confidence supersessions immediately
 * and defers low-confidence ones to daily compression.
 */
export function shouldSupersede(
  existing: KnowledgeEntry,
  incoming: IncomingData
): SupersessionDecision {
  // Must be same FSA
  if (existing.fsa_code !== incoming.fsa_code) {
    return noMatch('Different area');
  }

  // Must be same category to be comparable
  if (existing.category !== incoming.category) {
    // Exception: weather can supersede weather across data types
    if (existing.category === 'weather' && incoming.category === 'weather') {
      return weatherSupersession(existing, incoming);
    }
    return noMatch('Different category');
  }

  // Must be same grain (or both null)
  if (existing.grain !== incoming.grain && existing.grain !== null && incoming.grain !== null) {
    return noMatch('Different grain');
  }

  switch (existing.category) {
    case 'market':
      return marketSupersession(existing, incoming);
    case 'agronomic':
      return agronomicSupersession(existing, incoming);
    case 'weather':
      return weatherSupersession(existing, incoming);
    case 'intent':
      return intentSupersession(existing, incoming);
    case 'logistics':
      return logisticsSupersession(existing, incoming);
    case 'input_cost':
      return marketSupersession(existing, incoming); // same logic as market
    default:
      return noMatch('Unknown category');
  }
}

function marketSupersession(existing: KnowledgeEntry, incoming: IncomingData): SupersessionDecision {
  // Same data type and location = potential supersession
  if (existing.data_type !== incoming.data_type) {
    return noMatch('Different market data type');
  }

  const sameLocation = existing.location_detail === incoming.location_detail
    || (!existing.location_detail && !incoming.location_detail);

  if (!sameLocation) {
    return noMatch('Different location');
  }

  // Both have numeric values — compare
  if (existing.value_numeric !== null && incoming.value_numeric !== null) {
    const diff = Math.abs(existing.value_numeric - incoming.value_numeric);
    const pctDiff = existing.value_numeric !== 0
      ? diff / Math.abs(existing.value_numeric)
      : diff;

    // Close values (within 10%) = corroboration
    if (pctDiff <= 0.10) {
      return {
        action: 'corroborate',
        decision_type: 'corroboration_upgrade',
        confidence: 'high',
        reason: `Similar value reported (${existing.value_numeric} vs ${incoming.value_numeric})`,
      };
    }

    // Moderate difference (10-30%) = direct supersession
    if (pctDiff <= 0.30) {
      return {
        action: 'supersede',
        decision_type: 'direct_contradiction',
        confidence: 'high',
        reason: `Updated value: ${existing.value_numeric} → ${incoming.value_numeric}`,
      };
    }

    // Large difference (>30%) = flag for review
    return {
      action: 'flag_for_review',
      decision_type: 'direct_contradiction',
      confidence: 'low',
      reason: `Large discrepancy: ${existing.value_numeric} vs ${incoming.value_numeric} (${Math.round(pctDiff * 100)}% difference)`,
    };
  }

  // Text-based update
  if (incoming.value_text) {
    return {
      action: 'supersede',
      decision_type: 'direct_contradiction',
      confidence: 'medium',
      reason: 'Updated text-based market observation',
    };
  }

  return noMatch('No comparable values');
}

function weatherSupersession(existing: KnowledgeEntry, incoming: IncomingData): SupersessionDecision {
  // Weather supersedes aggressively — any new weather observation
  // in the same area updates the picture
  return {
    action: 'supersede',
    decision_type: 'progression',
    confidence: 'high',
    reason: `Weather update: ${existing.data_type} → ${incoming.data_type}`,
  };
}

function agronomicSupersession(existing: KnowledgeEntry, incoming: IncomingData): SupersessionDecision {
  if (existing.data_type !== incoming.data_type) {
    // Different agronomic types don't supersede each other
    // Exception: seeding_progress → harvest_progress is progression
    const STAGE_ORDER = ['seeding_progress', 'crop_condition', 'harvest_progress'];
    const existingIdx = STAGE_ORDER.indexOf(existing.data_type);
    const incomingIdx = STAGE_ORDER.indexOf(incoming.data_type);

    if (existingIdx >= 0 && incomingIdx > existingIdx) {
      return {
        action: 'supersede',
        decision_type: 'progression',
        confidence: 'high',
        reason: `Season progression: ${existing.data_type} → ${incoming.data_type}`,
      };
    }

    return noMatch('Different agronomic stage, no natural progression');
  }

  // Same data type — updated estimate
  if (existing.value_numeric !== null && incoming.value_numeric !== null) {
    return {
      action: 'supersede',
      decision_type: 'direct_contradiction',
      confidence: 'high',
      reason: `Revised estimate: ${existing.value_numeric} → ${incoming.value_numeric}`,
    };
  }

  return {
    action: 'supersede',
    decision_type: 'direct_contradiction',
    confidence: 'medium',
    reason: 'Updated agronomic observation',
  };
}

function intentSupersession(existing: KnowledgeEntry, incoming: IncomingData): SupersessionDecision {
  // Intent only supersedes on EXPLICIT change of plan
  // Another agronomic or market data point does NOT supersede intent
  if (incoming.category !== 'intent') {
    return noMatch('Non-intent data does not supersede intent');
  }

  if (existing.data_type !== incoming.data_type) {
    return noMatch('Different intent type');
  }

  // Same intent type — farmer changed their plan
  return {
    action: 'supersede',
    decision_type: 'direct_contradiction',
    confidence: 'high',
    reason: 'Farmer explicitly changed plan',
  };
}

function logisticsSupersession(existing: KnowledgeEntry, incoming: IncomingData): SupersessionDecision {
  if (existing.data_type !== incoming.data_type) {
    return noMatch('Different logistics type');
  }

  const sameLocation = existing.location_detail === incoming.location_detail;
  if (!sameLocation && existing.location_detail && incoming.location_detail) {
    return noMatch('Different facility');
  }

  return {
    action: 'supersede',
    decision_type: 'direct_contradiction',
    confidence: 'high',
    reason: `Logistics update: ${existing.data_type}`,
  };
}

function noMatch(reason: string): SupersessionDecision {
  return {
    action: 'no_match',
    decision_type: 'none',
    confidence: 'high',
    reason,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/supersession.test.ts`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add lib/knowledge/supersession.ts tests/lib/supersession.test.ts
git commit -m "feat: supersession engine with category-specific aging rules"
```

---

## Task 4: X API v2 Client

Direct X/Twitter API integration for background collection and real-time chat search.

**Files:**
- Create: `lib/x-api/client.ts`
- Create: `lib/x-api/farming-filter.ts`
- Create: `tests/lib/x-api-filter.test.ts`

**Step 1: Write the farming filter test**

```typescript
import { describe, it, expect } from 'vitest';
import { isFarmingRelevant, buildFarmingQuery } from '@/lib/x-api/farming-filter';

describe('isFarmingRelevant', () => {
  it('accepts grain price discussion', () => {
    expect(isFarmingRelevant('Canola basis tightening in SK -35 under')).toBe(true);
  });

  it('rejects crypto spam', () => {
    expect(isFarmingRelevant('WHEAT token to the moon 🚀 #crypto #defi')).toBe(false);
  });

  it('accepts weather impact on crops', () => {
    expect(isFarmingRelevant('Frost hit the canola hard last night in SE Saskatchewan')).toBe(true);
  });

  it('rejects stock market noise', () => {
    expect(isFarmingRelevant('Wheat futures down 2% on profit taking')).toBe(true); // futures ARE relevant
  });

  it('rejects non-farming content with grain keywords', () => {
    expect(isFarmingRelevant('Just had some great wheat beer at the brewery!')).toBe(false);
  });
});

describe('buildFarmingQuery', () => {
  it('builds query for major grain', () => {
    const query = buildFarmingQuery('Canola', 'major');
    expect(query).toContain('canola');
    expect(query).toContain('-is:retweet');
    expect(query).toContain('lang:en');
    expect(query).toContain('-crypto');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/x-api-filter.test.ts`
Expected: FAIL — module not found.

**Step 3: Write farming filter**

Create `lib/x-api/farming-filter.ts`:

```typescript
/**
 * X API Farming Filter
 *
 * Pre-filters and post-filters X/Twitter content for farming relevance.
 * Pre-filter: query operators sent to X API (reduces returned results).
 * Post-filter: content analysis on returned tweets (catches false positives).
 */

const NEGATIVE_KEYWORDS = [
  'crypto', 'bitcoin', 'NFT', 'defi', 'token', 'airdrop',
  'stock', 'forex', 'trading bot', 'brewery', 'beer', 'whiskey',
  'recipe', 'cooking', 'restaurant', 'fantasy',
];

const FARMING_SIGNALS = [
  // Direct farming terms
  /\b(basis|bushel|elevator|bin|silo|seeding|harvest|crop|acre|yield)\b/i,
  // Prairie geography
  /\b(Saskatchewan|Alberta|Manitoba|prairie|SK|AB|MB)\b/i,
  // Grain companies
  /\b(Viterra|Richardson|Cargill|G3|P&H|Bunge|AGT)\b/i,
  // Farming actions
  /\b(haul|deliver|spray|combine|swath|plant|seed|fertiliz)\b/i,
  // Market terms
  /\b(futures|basis|premium|discount|grade|protein|moisture)\b/i,
  // Weather in farming context
  /\b(frost|drought|rain|hail|moisture)\b/i,
  // Organizations
  /\b(CGC|CWB|CBOT|ICE|AAFC|Stats\s*Can)\b/i,
];

/**
 * Post-filter: checks if a tweet is genuinely about farming
 * vs. incidental use of grain-related words.
 */
export function isFarmingRelevant(text: string): boolean {
  const lower = text.toLowerCase();

  // Hard reject: crypto/finance spam
  for (const neg of NEGATIVE_KEYWORDS) {
    if (lower.includes(neg.toLowerCase())) {
      // Exception: "futures" in farming context is fine
      if (neg === 'stock' && /livestock/i.test(text)) continue;
      return false;
    }
  }

  // Must match at least one farming signal
  let signalCount = 0;
  for (const pattern of FARMING_SIGNALS) {
    if (pattern.test(text)) signalCount++;
  }

  // Need at least 2 farming signals to be confident
  return signalCount >= 2;
}

/**
 * Pre-filter: builds an X API v2 search query with farming operators.
 */
export function buildFarmingQuery(
  grain: string,
  tier: 'major' | 'mid' | 'minor'
): string {
  const grainLower = grain.toLowerCase();
  const negatives = '-is:retweet lang:en -crypto -bitcoin -NFT -defi -recipe -brewery';
  const geo = '(Saskatchewan OR Alberta OR Manitoba OR prairie OR elevator OR bushels OR harvest OR basis)';

  switch (tier) {
    case 'major':
      return `("${grainLower}" OR "${grainLower} price" OR "${grainLower} basis") ${geo} ${negatives}`;
    case 'mid':
      return `("${grainLower} price" OR "${grainLower} acres" OR "${grainLower} crop") ${negatives}`;
    case 'minor':
      return `"${grainLower}" (prairie OR Saskatchewan OR elevator) ${negatives}`;
  }
}

/**
 * Returns the grain tier for query budget allocation.
 */
export function getGrainTier(grain: string): 'major' | 'mid' | 'minor' {
  const MAJOR = ['Wheat', 'Canola', 'Barley', 'Oats'];
  const MID = ['Flax', 'Lentils', 'Peas', 'Soybeans'];
  if (MAJOR.includes(grain)) return 'major';
  if (MID.includes(grain)) return 'mid';
  return 'minor';
}
```

**Step 4: Write X API client**

Create `lib/x-api/client.ts`:

```typescript
/**
 * X API v2 Client
 *
 * Direct access to X/Twitter Recent Search API.
 * Uses Bearer Token auth (Basic tier: 10,000 tweets/month).
 *
 * Environment variables (Vercel):
 *   XAPI_BEARER_TOKEN — Bearer token for app-only auth
 *
 * Rate limits: 17 requests per 15-minute window (Basic tier).
 */

export interface XSearchResult {
  id: string;
  text: string;
  author_id: string;
  author_username?: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

export interface XSearchResponse {
  data: XSearchResult[] | null;
  meta: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
}

const X_API_BASE = 'https://api.x.com/2';

/**
 * Search recent tweets (7-day window) using X API v2.
 */
export async function searchRecentTweets(
  query: string,
  options: {
    maxResults?: number;
    startTime?: string; // ISO 8601
    bearerToken: string;
  }
): Promise<XSearchResponse> {
  const params = new URLSearchParams({
    query,
    max_results: String(options.maxResults || 10),
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username',
  });

  if (options.startTime) {
    params.set('start_time', options.startTime);
  }

  const response = await fetch(`${X_API_BASE}/tweets/search/recent?${params}`, {
    headers: {
      Authorization: `Bearer ${options.bearerToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X API error ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Rate-limit-aware wrapper that tracks requests.
 */
export class XApiClient {
  private bearerToken: string;
  private requestsInWindow = 0;
  private windowStart = Date.now();
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_REQUESTS = 17;

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
  }

  async search(query: string, maxResults = 10, startTime?: string): Promise<XSearchResponse> {
    this.checkRateLimit();

    const result = await searchRecentTweets(query, {
      maxResults,
      startTime,
      bearerToken: this.bearerToken,
    });

    this.requestsInWindow++;
    return result;
  }

  private checkRateLimit(): void {
    const now = Date.now();
    if (now - this.windowStart > this.WINDOW_MS) {
      // Reset window
      this.windowStart = now;
      this.requestsInWindow = 0;
    }

    if (this.requestsInWindow >= this.MAX_REQUESTS) {
      const waitMs = this.WINDOW_MS - (now - this.windowStart);
      throw new Error(
        `X API rate limit reached (${this.MAX_REQUESTS} requests per 15 min). ` +
        `Try again in ${Math.ceil(waitMs / 1000)} seconds.`
      );
    }
  }

  get remainingRequests(): number {
    const now = Date.now();
    if (now - this.windowStart > this.WINDOW_MS) return this.MAX_REQUESTS;
    return this.MAX_REQUESTS - this.requestsInWindow;
  }
}
```

**Step 5: Run tests**

Run: `npm test -- tests/lib/x-api-filter.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add lib/x-api/client.ts lib/x-api/farming-filter.ts tests/lib/x-api-filter.test.ts
git commit -m "feat: X API v2 client with farming filter and rate limit management"
```

---

## Task 5: Daily Compression Engine

The end-of-day process that triages extractions, supersedes working memory, detects patterns, and generates the daily summary.

**Files:**
- Create: `lib/knowledge/compression.ts`
- Create: `tests/lib/compression.test.ts`

**Step 1: Write the failing test**

Create `tests/lib/compression.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  triageExtraction,
  type TriageDecision,
} from '@/lib/knowledge/compression';

describe('triageExtraction', () => {
  it('promotes a new data point with no existing match', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -42,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        confidence: 'reported',
      },
      [] // no existing knowledge
    );
    expect(decision.action).toBe('promote');
  });

  it('corroborates when existing similar value exists', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -41,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        confidence: 'reported',
      },
      [{
        id: 'existing-1',
        fsa_code: 'S0A',
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        value_numeric: -42,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        source_count: 1,
        confidence_level: 'single_report',
        status: 'active',
        last_updated_at: new Date(),
      }]
    );
    expect(decision.action).toBe('corroborate');
    expect(decision.existing_id).toBe('existing-1');
  });

  it('discards non-farming noise', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: null,
        fsa_code: 'S0A',
        value_numeric: null,
        value_text: null,
        location_detail: null,
        confidence: 'inferred',
      },
      []
    );
    expect(decision.action).toBe('discard');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/compression.test.ts`
Expected: FAIL — module not found.

**Step 3: Write compression engine**

Create `lib/knowledge/compression.ts`:

```typescript
/**
 * Compression Engine
 *
 * Processes ephemeral extractions during daily compression:
 * - Promote: new knowledge → working memory
 * - Corroborate: matches existing → bump source_count
 * - Supersede: contradicts existing → replace
 * - Discard: noise, duplicates
 * - Defer: ambiguous — needs more data
 *
 * Also handles pattern detection and daily summary generation.
 */

import { shouldSupersede, type KnowledgeEntry } from './supersession';

export interface ExtractionForTriage {
  category: string;
  data_type: string;
  grain: string | null;
  fsa_code: string;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  confidence: string;
}

export interface TriageDecision {
  action: 'promote' | 'corroborate' | 'supersede' | 'discard' | 'defer';
  reason: string;
  existing_id?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Decides what to do with a single extraction against existing knowledge.
 */
export function triageExtraction(
  extraction: ExtractionForTriage,
  existingKnowledge: KnowledgeEntry[]
): TriageDecision {
  // Discard: no value at all
  if (!extraction.value_numeric && !extraction.value_text) {
    return {
      action: 'discard',
      reason: 'No value (numeric or text) present',
      confidence: 'high',
    };
  }

  // Find matching existing knowledge entries
  const matches = existingKnowledge.filter(
    (k) =>
      k.status === 'active' &&
      k.fsa_code === extraction.fsa_code &&
      k.category === extraction.category &&
      k.data_type === extraction.data_type &&
      (k.grain === extraction.grain || (!k.grain && !extraction.grain))
  );

  // No match — promote as new knowledge
  if (matches.length === 0) {
    return {
      action: 'promote',
      reason: 'New data point — no existing knowledge in this area',
      confidence: 'high',
    };
  }

  // Check each match for supersession
  for (const existing of matches) {
    // Narrow to same location if location matters
    if (
      existing.location_detail &&
      extraction.location_detail &&
      existing.location_detail !== extraction.location_detail
    ) {
      continue;
    }

    const decision = shouldSupersede(existing, {
      category: extraction.category,
      data_type: extraction.data_type,
      grain: extraction.grain,
      value_numeric: extraction.value_numeric,
      value_text: extraction.value_text,
      location_detail: extraction.location_detail,
      fsa_code: extraction.fsa_code,
    });

    switch (decision.action) {
      case 'supersede':
        return {
          action: 'supersede',
          reason: decision.reason,
          existing_id: existing.id,
          confidence: decision.confidence,
        };
      case 'corroborate':
        return {
          action: 'corroborate',
          reason: decision.reason,
          existing_id: existing.id,
          confidence: decision.confidence,
        };
      case 'flag_for_review':
        return {
          action: 'defer',
          reason: decision.reason,
          existing_id: existing.id,
          confidence: 'low',
        };
    }
  }

  // No matching location — promote as new location-specific knowledge
  return {
    action: 'promote',
    reason: 'New location for existing data type',
    confidence: 'high',
  };
}

/**
 * Generates the daily compression summary structure.
 * Called after all extractions have been triaged.
 */
export interface CompressionStats {
  conversations_processed: number;
  extractions_total: number;
  promoted: number;
  corroborated: number;
  superseded: number;
  discarded: number;
  deferred: number;
}

export interface SupersessionRecord {
  what: string;
  old_value: string;
  new_value: string;
  reason: string;
  confidence: string;
}

export interface ReviewFlag {
  issue: string;
  detail: string;
  hermes_suggestion: string;
}

export interface DailySummary {
  date: string;
  stats: CompressionStats;
  supersession_decisions: SupersessionRecord[];
  flags_for_review: ReviewFlag[];
  patterns_detected: string[];
  aging_warnings: { entry: string; last_updated: string; note: string }[];
  weather_summary: Record<string, string>;
}

export function createEmptySummary(date: string): DailySummary {
  return {
    date,
    stats: {
      conversations_processed: 0,
      extractions_total: 0,
      promoted: 0,
      corroborated: 0,
      superseded: 0,
      discarded: 0,
      deferred: 0,
    },
    supersession_decisions: [],
    flags_for_review: [],
    patterns_detected: [],
    aging_warnings: [],
    weather_summary: {},
  };
}
```

**Step 4: Run tests**

Run: `npm test -- tests/lib/compression.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add lib/knowledge/compression.ts tests/lib/compression.test.ts
git commit -m "feat: daily compression engine with triage logic and summary generation"
```

---

## Task 6: Hermes Server — GCP VM Chat Backend

The persistent Node.js process that handles farmer conversations, runs compression, and manages the knowledge engine.

**Files:**
- Create: `hermes/server.ts` — main HTTP server
- Create: `hermes/conversation-manager.ts` — per-farmer conversation state
- Create: `hermes/compression-scheduler.ts` — daily/weekly cron
- Create: `hermes/tools.ts` — tool definitions for Hermes
- Create: `hermes/Dockerfile`
- Create: `hermes/package.json`
- Create: `hermes/tsconfig.json`

**Note:** This is the largest task. It creates the Hermes server as a standalone Node.js project within the monorepo. Hermes imports shared knowledge modules from `lib/knowledge/` and communicates with Supabase for all state persistence.

**Step 1: Create Hermes project structure**

```bash
mkdir -p hermes
```

**Step 2: Write `hermes/package.json`**

```json
{
  "name": "bushel-board-hermes",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch server.ts",
    "start": "node --import tsx server.ts",
    "build": "tsc",
    "health": "curl -s http://localhost:3002/health | jq ."
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 3: Write `hermes/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "paths": {
      "@/lib/*": ["../lib/*"]
    }
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Write `hermes/server.ts`**

```typescript
/**
 * Hermes Chat Server
 *
 * Persistent Node.js process on GCP VM that handles farmer conversations.
 * Replaces the stateless chat-completion Edge Function.
 *
 * Endpoints:
 *   POST /chat       — farmer message → SSE response stream
 *   GET  /health     — health check for monitoring
 *   POST /compress   — manual trigger for daily compression
 *
 * All state persists in Supabase. Hermes is crash-recoverable.
 */

import { createClient } from '@supabase/supabase-js';
import { ConversationManager } from './conversation-manager';
import { startCompressionScheduler } from './compression-scheduler';
import http from 'node:http';

const PORT = Number(process.env.HERMES_PORT || 3002);
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INTERNAL_SECRET = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET!;
const XAI_API_KEY = process.env.XAI_API_KEY!;
const XAPI_BEARER_TOKEN = process.env.XAPI_BEARER_TOKEN!;

// Validate required env vars
for (const [name, val] of Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_KEY,
  BUSHEL_INTERNAL_FUNCTION_SECRET: INTERNAL_SECRET, XAI_API_KEY,
})) {
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const conversationManager = new ConversationManager(supabase, XAI_API_KEY);

// Start compression scheduler (daily 10 PM MST, weekly Friday 9 PM MST)
startCompressionScheduler(supabase);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      activeConversations: conversationManager.activeCount,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Chat endpoint
  if (url.pathname === '/chat' && req.method === 'POST') {
    // Auth: verify internal secret from Vercel proxy
    const authHeader = req.headers['x-bushel-internal-secret'];
    if (authHeader !== INTERNAL_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      await conversationManager.handleMessage(payload, (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      });
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
    }

    res.write('event: done\ndata: {}\n\n');
    res.end();
    return;
  }

  // Manual compression trigger
  if (url.pathname === '/compress' && req.method === 'POST') {
    const authHeader = req.headers['x-bushel-internal-secret'];
    if (authHeader !== INTERNAL_SECRET) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    // TODO: trigger compression manually
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'compression_queued' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[Hermes] Chat server listening on port ${PORT}`);
  console.log(`[Hermes] Supabase: ${SUPABASE_URL}`);
  console.log(`[Hermes] Compression: daily 10 PM MST, weekly Friday 9 PM MST`);
});
```

**Step 5: Write `hermes/conversation-manager.ts`**

This is a skeleton that will be fleshed out — the core message handling loop:

```typescript
/**
 * Conversation Manager
 *
 * Handles concurrent farmer conversations with isolated context.
 * Each conversation loads: thread history, farmer card, working memory.
 * Extracts farming data from messages and manages supersession in real-time.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface ChatPayload {
  userId: string;
  threadId?: string;
  message: string;
  grain?: string;
  fsaCode: string;
  role: string;
}

type SSEWriter = (event: string, data: unknown) => void;

export class ConversationManager {
  private supabase: SupabaseClient;
  private xaiApiKey: string;
  private activeConversations = new Map<string, boolean>();

  constructor(supabase: SupabaseClient, xaiApiKey: string) {
    this.supabase = supabase;
    this.xaiApiKey = xaiApiKey;
  }

  get activeCount(): number {
    return this.activeConversations.size;
  }

  async handleMessage(payload: ChatPayload, write: SSEWriter): Promise<void> {
    const { userId, message, grain, fsaCode } = payload;

    // Mark conversation active
    this.activeConversations.set(userId, true);

    try {
      // 1. Ensure thread exists
      const threadId = payload.threadId || await this.createThread(userId, grain);

      // 2. Save user message
      await this.saveMessage(threadId, userId, 'user', message);

      // 3. Load context (parallel)
      const [farmerCard, workingMemory, recentHistory] = await Promise.all([
        this.loadFarmerCard(userId),
        this.loadWorkingMemory(fsaCode, grain),
        this.loadRecentHistory(threadId),
      ]);

      // 4. Classify message for data extraction
      // TODO: use classifyMessage from lib/knowledge/classification.ts
      // For now, this will be handled by Grok's tool calls

      // 5. Call Grok via xAI Responses API
      const systemPrompt = this.buildSystemPrompt(farmerCard, workingMemory);

      // 6. Stream response
      // TODO: implement xAI Responses API streaming with tool callbacks
      write('response.output_text.delta', { delta: 'Hermes chat coming soon — server skeleton active.' });

      // 7. Save assistant response
      await this.saveMessage(threadId, userId, 'assistant', 'Hermes chat coming soon — server skeleton active.');

    } finally {
      this.activeConversations.delete(userId);
    }
  }

  private async createThread(userId: string, grain?: string | null): Promise<string> {
    const { data, error } = await this.supabase
      .from('chat_threads')
      .insert({
        user_id: userId,
        grain_context: grain ? [grain] : [],
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create thread: ${error.message}`);
    return data.id;
  }

  private async saveMessage(
    threadId: string, userId: string, role: string, content: string
  ): Promise<void> {
    await this.supabase.from('chat_messages').insert({
      thread_id: threadId,
      user_id: userId,
      role,
      content,
    });
  }

  private async loadFarmerCard(userId: string): Promise<Record<string, unknown>> {
    const { data } = await this.supabase
      .from('profiles')
      .select('*, crop_plans(*)')
      .eq('id', userId)
      .single();
    return data || {};
  }

  private async loadWorkingMemory(
    fsaCode: string, grain?: string | null
  ): Promise<Record<string, unknown>[]> {
    let query = this.supabase
      .from('knowledge_state')
      .select('*')
      .eq('fsa_code', fsaCode)
      .eq('status', 'active')
      .order('last_updated_at', { ascending: false })
      .limit(50);

    if (grain) {
      query = query.or(`grain.eq.${grain},grain.is.null`);
    }

    const { data } = await query;
    return data || [];
  }

  private async loadRecentHistory(threadId: string): Promise<Record<string, unknown>[]> {
    const { data } = await this.supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(20);
    return (data || []).reverse();
  }

  private buildSystemPrompt(
    _farmerCard: Record<string, unknown>,
    _workingMemory: Record<string, unknown>[]
  ): string {
    // TODO: port from chat-context-builder.ts + add knowledge engine context
    return 'You are Bushy, a prairie grain market intelligence assistant.';
  }
}
```

**Step 6: Write `hermes/compression-scheduler.ts`**

```typescript
/**
 * Compression Scheduler
 *
 * Runs daily compression at 10 PM MST and weekly compression Friday 9 PM MST.
 * Both are idempotent — safe to re-run on failure.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import cron from 'node-cron';

export function startCompressionScheduler(supabase: SupabaseClient): void {
  // Daily compression: 10 PM MST (4 AM UTC next day)
  // MST = UTC-7, so 10 PM MST = 5 AM UTC
  cron.schedule('0 5 * * *', async () => {
    console.log('[Hermes] Starting daily compression...');
    try {
      await runDailyCompression(supabase);
      console.log('[Hermes] Daily compression complete.');
    } catch (err) {
      console.error('[Hermes] Daily compression failed:', err);
    }
  });

  // Weekly compression: Friday 9 PM MST (4 AM UTC Saturday)
  // 9 PM MST = 4 AM UTC
  cron.schedule('0 4 * * 6', async () => {
    console.log('[Hermes] Starting weekly compression...');
    try {
      await runWeeklyCompression(supabase);
      console.log('[Hermes] Weekly compression complete.');
    } catch (err) {
      console.error('[Hermes] Weekly compression failed:', err);
    }
  });

  console.log('[Hermes] Compression scheduler started (daily 10 PM MST, weekly Fri 9 PM MST)');
}

async function runDailyCompression(supabase: SupabaseClient): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Check if already run today
  const { data: existing } = await supabase
    .from('compression_summaries')
    .select('id')
    .eq('period', 'daily')
    .eq('compression_date', today)
    .maybeSingle();

  if (existing) {
    console.log(`[Hermes] Daily compression already run for ${today}, skipping.`);
    return;
  }

  // Phase 1: Load unprocessed extractions
  const { data: extractions } = await supabase
    .from('chat_extractions')
    .select('*')
    .eq('promoted', false)
    .eq('discarded', false)
    .order('extracted_at', { ascending: true });

  if (!extractions || extractions.length === 0) {
    console.log('[Hermes] No extractions to process.');
    // Still write empty summary for audit trail
    await supabase.from('compression_summaries').insert({
      period: 'daily',
      compression_date: today,
      extractions_total: 0,
      summary: { date: today, note: 'No extractions to process' },
    });
    return;
  }

  // Phase 2: Load existing active knowledge
  const { data: activeKnowledge } = await supabase
    .from('knowledge_state')
    .select('*')
    .eq('status', 'active');

  // Phase 3: Triage each extraction
  // TODO: implement full triage loop using triageExtraction()
  // For now, log what would be processed
  console.log(`[Hermes] Would process ${extractions.length} extractions against ${activeKnowledge?.length || 0} active knowledge entries.`);

  // Phase 4: Write summary
  await supabase.from('compression_summaries').insert({
    period: 'daily',
    compression_date: today,
    extractions_total: extractions.length,
    summary: {
      date: today,
      extractions_found: extractions.length,
      active_knowledge: activeKnowledge?.length || 0,
      status: 'skeleton — full triage not yet implemented',
    },
  });
}

async function runWeeklyCompression(supabase: SupabaseClient): Promise<void> {
  const friday = new Date().toISOString().split('T')[0];

  // Check if already run
  const { data: existing } = await supabase
    .from('compression_summaries')
    .select('id')
    .eq('period', 'weekly')
    .eq('compression_date', friday)
    .maybeSingle();

  if (existing) {
    console.log(`[Hermes] Weekly compression already run for ${friday}, skipping.`);
    return;
  }

  // TODO: implement macro/micro reconciliation + farmer brief generation
  // For now, write skeleton summary
  console.log('[Hermes] Weekly compression skeleton — full implementation pending.');

  await supabase.from('compression_summaries').insert({
    period: 'weekly',
    compression_date: friday,
    summary: {
      date: friday,
      status: 'skeleton — macro/micro reconciliation not yet implemented',
    },
  });
}
```

**Step 7: Write `hermes/Dockerfile`**

```dockerfile
FROM node:22-slim

WORKDIR /app

# Copy hermes package files
COPY hermes/package.json hermes/tsconfig.json ./

# Copy shared lib modules that hermes imports
COPY lib/knowledge/ ./lib/knowledge/
COPY lib/x-api/ ./lib/x-api/

RUN npm install --production

# Copy hermes source
COPY hermes/*.ts ./

EXPOSE 3002

CMD ["node", "--import", "tsx", "server.ts"]
```

**Step 8: Commit**

```bash
git add hermes/
git commit -m "feat: Hermes chat server skeleton — HTTP server, conversation manager, compression scheduler, Dockerfile"
```

---

## Task 7: Update Vercel API Route — Proxy to Hermes

Modify the existing chat API route to proxy messages to Hermes instead of calling the Edge Function directly.

**Files:**
- Modify: `app/api/advisor/chat/route.ts`

**Step 1: Add Hermes proxy mode**

The route should detect if `HERMES_URL` env var is set. If so, proxy to Hermes. If not, fall back to the existing Edge Function path (backward compatible).

```typescript
// At the top of route.ts, add:
const HERMES_URL = process.env.HERMES_URL; // e.g., "http://hermes-vm-ip:3002"
const INTERNAL_SECRET = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

// In the POST handler, before the existing xAI call:
if (HERMES_URL) {
  // Proxy to Hermes
  const hermesResponse = await fetch(`${HERMES_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bushel-internal-secret': INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      userId: user.id,
      threadId,
      message: body.message,
      grain: body.grain,
      fsaCode: profile.postal_code?.substring(0, 3) || '',
      role: profile.role,
    }),
  });

  // Forward SSE stream from Hermes to client
  return new Response(hermesResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ... existing Edge Function / xAI code as fallback
```

**Step 2: Test locally**

Start Hermes locally: `cd hermes && npm run dev`
Set env: `HERMES_URL=http://localhost:3002`
Run Next.js dev server and send a chat message.
Expected: SSE stream from Hermes skeleton.

**Step 3: Commit**

```bash
git add app/api/advisor/chat/route.ts
git commit -m "feat: Vercel chat route proxies to Hermes when HERMES_URL is set (backward compatible)"
```

---

## Task 8: RPC Functions for Knowledge Queries

Database functions that Hermes calls to read/write the tiered memory.

**Files:**
- Create: `supabase/migrations/20260416070000_knowledge_rpcs.sql`

**Step 1: Write RPC migration**

```sql
-- RPC: Get active working memory for an area/grain
CREATE OR REPLACE FUNCTION get_area_knowledge(
  p_fsa_code text,
  p_grain text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS SETOF knowledge_state
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM knowledge_state
  WHERE fsa_code = p_fsa_code
    AND status = 'active'
    AND (p_grain IS NULL OR grain = p_grain OR grain IS NULL)
    AND (p_category IS NULL OR category = p_category)
  ORDER BY last_updated_at DESC
  LIMIT 100;
$$;

-- RPC: Get active patterns for an area
CREATE OR REPLACE FUNCTION get_area_patterns(
  p_fsa_code text,
  p_grain text DEFAULT NULL
)
RETURNS SETOF knowledge_patterns
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM knowledge_patterns
  WHERE (fsa_code = p_fsa_code OR fsa_code IS NULL)
    AND status = 'active'
    AND (p_grain IS NULL OR grain = p_grain OR grain IS NULL)
  ORDER BY confidence_score DESC, last_validated_at DESC
  LIMIT 50;
$$;

-- RPC: Get latest farmer brief
CREATE OR REPLACE FUNCTION get_latest_farmer_brief(
  p_user_id uuid
)
RETURNS SETOF weekly_farmer_briefs
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM weekly_farmer_briefs
  WHERE user_id = p_user_id
  ORDER BY week_ending DESC
  LIMIT 1;
$$;

-- RPC: Get compression summary
CREATE OR REPLACE FUNCTION get_latest_compression(
  p_period text DEFAULT 'daily'
)
RETURNS SETOF compression_summaries
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM compression_summaries
  WHERE period = p_period
  ORDER BY compression_date DESC
  LIMIT 1;
$$;

-- Notify PostgREST to pick up new functions
NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply migration**

Run: `npx supabase db push`
Expected: Migration applied.

**Step 3: Verify RPCs are accessible**

```sql
SELECT * FROM get_area_knowledge('T0L');
SELECT * FROM get_area_patterns('T0L');
SELECT * FROM get_latest_compression('daily');
```
Expected: Empty result sets (no data yet), no errors.

**Step 4: Commit**

```bash
git add supabase/migrations/20260416070000_knowledge_rpcs.sql
git commit -m "feat: knowledge query RPCs — get_area_knowledge, get_area_patterns, get_latest_farmer_brief, get_latest_compression"
```

---

## Task 9: Update CLAUDE.md & STATUS.md

Document the new tables, RPCs, and architecture in project docs.

**Files:**
- Modify: `CLAUDE.md` — add new tables to Tables list, new RPCs to RPC list, new monitoring queries
- Modify: `docs/plans/STATUS.md` — add Track 42

**Step 1: Update CLAUDE.md**

Add to the Tables list in Intelligence Pipeline:
```
`chat_extractions` (Tier 1 ephemeral: raw data points from conversations, classified by category/data_type, promoted/discarded during compression),
`knowledge_state` (Tier 2 working memory: what Hermes currently believes to be true per FSA/grain/data_type, with supersession tracking),
`knowledge_patterns` (Tier 3 long-term: trends, anomalies, area shifts detected by compression),
`compression_summaries` (daily + weekly compression audit logs with decision records),
`weekly_farmer_briefs` (personalized weekly intelligence merging macro thesis + local data),
`x_api_query_log` (X API call tracking for dedup + budget optimization)
```

Add to RPC functions list:
```
`get_area_knowledge(p_fsa_code, p_grain, p_category)` (active working memory for an area),
`get_area_patterns(p_fsa_code, p_grain)` (active patterns for an area),
`get_latest_farmer_brief(p_user_id)` (most recent weekly brief),
`get_latest_compression(p_period)` (latest compression summary)
```

Add monitoring queries:
```
- Knowledge state: `SELECT fsa_code, category, COUNT(*) FROM knowledge_state WHERE status='active' GROUP BY fsa_code, category ORDER BY fsa_code;`
- Chat extractions: `SELECT category, COUNT(*), SUM(CASE WHEN promoted THEN 1 ELSE 0 END) as promoted, SUM(CASE WHEN discarded THEN 1 ELSE 0 END) as discarded FROM chat_extractions GROUP BY category;`
- Compression: `SELECT period, compression_date, extractions_total, promoted, superseded, flags_for_review FROM compression_summaries ORDER BY compression_date DESC LIMIT 10;`
- Knowledge patterns: `SELECT pattern_type, status, COUNT(*) FROM knowledge_patterns GROUP BY pattern_type, status;`
- X API budget: `SELECT mode, DATE(searched_at), COUNT(*), SUM(tweets_relevant), AVG(value_score)::int FROM x_api_query_log GROUP BY mode, DATE(searched_at) ORDER BY DATE(searched_at) DESC LIMIT 10;`
- Weekly briefs: `SELECT user_id, week_ending, array_length(grains_covered, 1) as grains FROM weekly_farmer_briefs ORDER BY week_ending DESC LIMIT 10;`
```

**Step 2: Update STATUS.md with Track 42**

**Step 3: Commit**

```bash
git add CLAUDE.md docs/plans/STATUS.md
git commit -m "docs: Track 42 — Hermes Chat Agent tables, RPCs, and monitoring queries"
```

---

## Summary

| Task | What it builds | Commits |
|------|---------------|---------|
| 1 | 6 database tables (tiered memory + X API tracking) | 1 |
| 2 | Classification engine (6 categories, pattern matching) | 1 |
| 3 | Supersession engine (category-specific aging rules) | 1 |
| 4 | X API v2 client + farming filter | 1 |
| 5 | Daily compression engine (triage + summary) | 1 |
| 6 | Hermes server (HTTP, conversation manager, scheduler, Docker) | 1 |
| 7 | Vercel proxy to Hermes (backward compatible) | 1 |
| 8 | Knowledge query RPCs | 1 |
| 9 | CLAUDE.md + STATUS.md updates | 1 |

**Total: 9 tasks, 9 commits.**

**Execution order:** Tasks 1-5 are independent modules with tests. Task 6 depends on 2-5 (imports them). Task 7 depends on 6. Task 8 depends on 1. Task 9 is always last.

**Recommended parallel groups:**
- **Batch 1 (parallel):** Tasks 1, 2, 3, 4, 5 — all independent
- **Batch 2 (sequential):** Task 6 (depends on 2-5), then Task 7 (depends on 6)
- **Batch 3 (parallel):** Tasks 8, 9 — independent documentation/DB
