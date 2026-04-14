# Unified Pricing Board — Daily Price Exchange for Operators & Farmers

**Date:** 2026-04-14
**Status:** Approved
**Author:** Kyle + Claude (brainstorming session)
**Track:** 39 — Unified Pricing Board
**Replaces:** `elevator_prices` table (Track 36 Phase 3), `provider_listings` table (Track 36 Phase 4)

---

## Problem

Farmers need today's prices. Elevators and input dealers have them. The current system has two separate tables (`elevator_prices`, `provider_listings`) with divergent schemas, separate tools, and no feedback loop from farmers back to operators. The result: two code paths that both do the same thing — connect supply-side pricing to demand-side queries.

## Solution

A single **unified pricing board** where any ag business — elevator, crusher, seed company, fertilizer dealer, chemical company — posts daily prices through Bushy. Farmers pull prices conversationally. Operators see demand analytics (how many farmers asked about each grain/product). The feedback loop drives daily posting habits: operators learn what's hot, farmers get fresh prices.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Table structure | One unified `posted_prices` table | Both old tables have 0 rows — free to unify now. One tool to post, one to query. |
| Price expiry | 24 hours default | Encourages daily posting. Stale prices are worse than no prices. |
| FSA targeting | Max 3 codes per posting | Matches registered farmer postal areas. Tight geographic relevance. |
| Capacity/notes | Operator enters manually | Free-form `capacity_notes` and `delivery_notes`. Bushy weaves into farmer responses. |
| Demand analytics | Daily counts + grain ranking + weekly trend | Delivered conversationally via Bushy, no dashboard needed v1. |
| Product line | `operator_products` table seeded at signup | Add/remove via chat. Quick-update shows their catalog for price editing. |
| Facility status | `facility_status` column on profiles | Overwrite on next post. "Taking canola until Wed, wheat starting Thu." |
| Feedback | Extend existing `feedback_log` with `user_role` | Operators and farmers both tell Bushy what they want. No separate form. |
| Quick-update | Bushy echoes yesterday's prices for editing | "Same prices today, or anything change?" — minimizes daily friction. |

---

## 1. Data Model

### 1.1 `posted_prices` (new — replaces `elevator_prices` + `provider_listings`)

```sql
CREATE TABLE posted_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  business_type text NOT NULL CHECK (
    business_type IN ('elevator','crusher','mill','terminal','seed','fertilizer','chemical')
  ),
  facility_name text NOT NULL,
  grain text NOT NULL,                  -- "Wheat", "Canola" for elevators; "Urea 46-0-0" for inputs
  grade text,                           -- "CWRS 1", "#1 Canola", null for inputs
  price_per_tonne numeric,
  price_per_bushel numeric,
  basis numeric,
  basis_reference text,                 -- "ICE Canola", "CBOT Wheat"
  delivery_period text NOT NULL DEFAULT 'spot',
  unit text NOT NULL DEFAULT 'tonne' CHECK (
    unit IN ('tonne','bushel','acre','jug','bag','each')
  ),
  capacity_notes text,                  -- "need 30t", "limited space"
  delivery_notes text,                  -- "Taking for 2 more days", "contract only"
  special_offer text,                   -- "10% off until May 15"
  target_fsa_codes text[] NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,      -- 24h default
  source_method text NOT NULL DEFAULT 'chat' CHECK (source_method IN ('chat','form')),
  is_sponsored boolean NOT NULL DEFAULT false,
  CONSTRAINT max_three_fsa CHECK (array_length(target_fsa_codes, 1) <= 3),
  CONSTRAINT has_price_or_info CHECK (
    price_per_tonne IS NOT NULL OR price_per_bushel IS NOT NULL
    OR basis IS NOT NULL OR special_offer IS NOT NULL
  )
);
```

**Indexes:**
- GIN on `target_fsa_codes` (area lookups)
- btree on `(operator_id, posted_at DESC)` (operator's own prices)
- btree on `(grain, posted_at DESC)` (grain + freshness queries)
- btree on `(expires_at DESC)` (expiry filtering)

**RLS:**
- Operators manage own prices (`auth.uid() = operator_id`)
- Authenticated users read unexpired prices (`expires_at > now()`)

### 1.2 `operator_products` (new — operator's catalog)

```sql
CREATE TABLE operator_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_name text NOT NULL,           -- "Wheat", "CWRS 1", "Urea 46-0-0"
  product_category text,                -- "grain", "fertilizer", "herbicide", "seed"
  is_active boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, product_name)
);
```

**RLS:**
- Operators manage own products (`auth.uid() = operator_id`)

Seeded from signup metadata. Operators add/remove via chat. The quick-update flow queries active products to show what needs pricing.

### 1.3 `price_query_log` (new — demand analytics)

```sql
CREATE TABLE price_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users,
  farmer_id uuid NOT NULL REFERENCES auth.users,
  grain text NOT NULL,
  fsa_code text NOT NULL,
  queried_at timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- btree on `(operator_id, queried_at DESC)` (operator analytics queries)
- btree on `(operator_id, grain, queried_at DESC)` (per-grain counts)

**RLS:**
- Operators read own query logs (`auth.uid() = operator_id`)
- Service role inserts (from chat tool execution)

Farmer identity (`farmer_id`) is stored for deduplication only. Never exposed to operators — analytics RPC returns aggregate counts only.

### 1.4 Profile changes

Add to `profiles`:
- `facility_status text` — facility-wide operational note, overwritten on each update

Existing columns reused: `company_name`, `facility_name`, `facility_type`, `postal_code`, `provider_type`, `service_area_fsa`.

### 1.5 Feedback extension

Add to `feedback_log`:
- `user_role text` — captures whether feedback came from a farmer or operator

### 1.6 Tables to drop

- `elevator_prices` — 0 rows in production
- `provider_listings` — 0 rows in production

Associated RPCs (`get_elevator_prices_for_area`, `get_provider_listings_for_area`) also dropped.

---

## 2. RPCs

### `get_area_prices(p_fsa_code, p_grain, p_business_type)`

Returns unexpired posted prices matching a farmer's FSA, optionally filtered by grain or business type. JOINs profiles for facility name and status. Sorted by freshness. Used by both the chat tool and context builder.

Returns: id, business_type, facility_name, facility_status, grain, grade, price_per_tonne, price_per_bushel, basis, basis_reference, delivery_period, unit, capacity_notes, delivery_notes, special_offer, is_sponsored, posted_at, hours_since_posted.

### `get_operator_analytics(p_operator_id, p_days_back)`

Returns per-grain query counts for the operator, with current period and previous period for trend. Service-role only (called from chat tool, not directly by client).

Returns: grain, current_count, previous_count, trend ('up','down','flat').

### `get_operator_reach(p_fsa_codes)`

Returns count of registered farmers in the target FSA codes. Used after posting to show "247 farmers can see your prices now."

Returns: farmer_count.

---

## 3. Chat Tools

### `post_daily_prices` (replaces `save_elevator_prices` + `save_provider_listing`)

Role guard: only elevator/crusher/mill/terminal/seed/fertilizer/chemical roles.

Two modes:
1. **Fresh post** — operator pastes prices, Bushy parses into structured entries, confirms, inserts
2. **Quick-update** — Bushy loads yesterday's expired/expiring prices, shows them, operator says what changed, Bushy updates

Both modes: confirm before posting, show farmer reach count after posting, mention yesterday's query counts as a teaser.

### `get_area_prices` (replaces `get_local_elevator_prices` + `get_provider_listings`)

Farmer queries prices in their area. Calls `get_area_prices` RPC. Logs each result to `price_query_log`. Returns structured text with facility name, price, basis, capacity, delivery notes, facility status, and source tags.

### `manage_products`

Add/remove products from operator's catalog. Updates `operator_products.is_active`.

### `get_demand_analytics`

Operator asks "how are my prices doing?" Calls `get_operator_analytics` RPC. Returns grain ranking with counts and weekly trend.

### `update_facility_status`

Operator says "taking canola for 2 days then switching to wheat." Saves to `profiles.facility_status`. Overwritten on next update.

---

## 4. Chat Flows

### 4.1 Operator: First-time posting

```
Operator: "Wheat CWRS1 565/t basis +40, need about 30 tonnes.
           Canola #1 720/t basis -15, lots of room."

Bushy: "Got it — here's what I parsed:
  Wheat CWRS 1 — $565/t, basis +40, need ~30t
  Canola #1 — $720/t, basis -15, lots of room
Post to T0L, T0K, T0C? These expire tomorrow morning."

Operator: "Yes"

Bushy: "Posted. 247 farmers in those areas can see your prices now."
```

### 4.2 Operator: Quick-update (daily return)

```
Bushy: "Morning — yesterday's prices:
  1. Wheat CWRS 1 — $565/t, basis +40, 30t room
  2. Canola #1 — $720/t, basis -15, lots of room
Same prices today, or anything change?"

Operator: "Wheat down to 555, canola same"

Bushy: "Updated:
  Wheat CWRS 1 — $555/t, basis +40, 30t room  ← changed
  Canola #1 — $720/t, basis -15, lots of room
Posted to T0L, T0K, T0C. Yesterday wheat was queried 14 times, canola 8."
```

### 4.3 Operator: Facility status

```
Operator: "Will be taking canola for the next 2 days and then switching to wheat"

Bushy: "Noted — I'll let farmers know:
  'Taking canola until Wed, switching to wheat Thu.'
This shows up when anyone asks about your facility."
```

### 4.4 Operator: Demand analytics

```
Operator: "How are my prices doing?"

Bushy: "This week's interest in your prices:
  1. Canola — 42 queries (↑ up from 31 last week)
  2. Wheat — 28 queries (↓ down from 35)
  3. Oats — 6 queries (new this week)
Canola interest is hot. Might be worth sharpening that basis."
```

### 4.5 Operator: Product line management

```
Operator: "I'm taking oats now too"
Bushy: "Added Oats to your product line. Want to post a price?"

Operator: "Drop barley"
Bushy: "Removed Barley. Existing barley prices expire normally."
```

### 4.6 Farmer: Price query

```
Farmer: "What are wheat prices in my area?"

Bushy: "As of 9am, here's wheat near you (T0L):

  Richardson Kindersley — $555/t, CWRS 1, basis +40 [posted pricing]
    Need about 30 tonnes, lots of room. Taking wheat all week.

  Viterra Rosetown — $548/t, CWRS 1, basis +32 [posted pricing]
    Limited space — contract deliveries only this week.

  Richardson's the strongest right now. Basis at +40 is solid
  for this time of year.

  Thinking about hauling? Want the bull/bear forecast for wheat,
  or price another grain?"
```

### 4.7 Farmer: Input price query

```
Farmer: "What are people paying for fertilizer?"

Bushy: "Posted near you (T0L):

  Prairie Ag Supply — Urea 46-0-0 at $680/t [posted pricing]
    10% off if you order before May 15.

  A couple farmers nearby reported paying $650-700/t. [local reports]

  Want details on another product?"
```

---

## 5. Signup Flow

### Elevator/crusher/mill/terminal signup
Fields: company name, facility name, facility type, postal code, 3 FSA codes, grains they buy (multi-select or free text → seeds `operator_products`).

### Seed/fertilizer/chemical signup
Fields: company name, postal code, 3 FSA codes, products they sell (free text → seeds `operator_products`).

Both paths store role-appropriate metadata in profiles and seed the initial product catalog in `operator_products`.

---

## 6. Source Tags & Privacy

### Source tags (inline in Bushy responses)
- `[posted pricing]` — from operators (company-posted, verified source)
- `[local reports]` — from farmer-reported intel in `local_market_intel`
- `[sponsored]` — paid placement (always tagged, never disguised)
- `[national market]` — CGC, CFTC, USDA data
- `[your history]` — farmer's own past data

### Privacy boundaries
- Farmers see: facility name, price, basis, grade, capacity notes, delivery notes, facility status
- Farmers never see: operator's personal identity, other farmers' identities
- Operators see: their own prices, aggregate query counts per grain, weekly trend
- Operators never see: individual farmer identities, other operators' prices

---

## 7. Deferred (v2+)

| Feature | Why defer |
|---------|-----------|
| Push notifications on new prices | Farmers pull via chat. Revisit when usage proves demand. |
| Operator price comparison | Competitive sensitivity. Needs careful design. |
| Sponsored/promoted listings | Zero operators yet. Premature monetization. |
| Photo-to-price OCR | Chat-paste covers the use case. OCR adds complexity for marginal gain. |
| Area heat maps | Counts + ranking sufficient for v1. Maps need a dashboard. |
| Farmer-to-operator messaging | Privacy boundary complexity. Defer until trust established. |

---

## 8. Migration Strategy

Both `elevator_prices` and `provider_listings` have 0 rows. The migration:

1. Create `posted_prices`, `operator_products`, `price_query_log`
2. Add `facility_status` to profiles, `user_role` to `feedback_log`
3. Create RPCs: `get_area_prices`, `get_operator_analytics`, `get_operator_reach`
4. Drop old RPCs: `get_elevator_prices_for_area`, `get_provider_listings_for_area`
5. Drop old tables: `elevator_prices`, `provider_listings`
6. Update `handle_new_user()` to seed `operator_products`
7. Update chat tools: replace 4 tools with unified `post_daily_prices`, `get_area_prices`, `manage_products`, `get_demand_analytics`, `update_facility_status`
8. Update context builder: load from `posted_prices` instead of both old tables
9. Update signup form: capture product line, postal code for all operator types
