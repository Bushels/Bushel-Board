# Unified Pricing Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the separate `elevator_prices` and `provider_listings` tables with a unified `posted_prices` system, add operator product catalogs, demand analytics, facility status, and a quick-update posting flow.

**Architecture:** Single migration drops both empty tables and creates three new ones (`posted_prices`, `operator_products`, `price_query_log`). Chat tools collapse from 4 separate tools to 5 unified ones. Context builder and system prompt adapt to the unified schema.

**Tech Stack:** Supabase (PostgreSQL, Edge Functions), Next.js signup form, Deno chat-completion Edge Function.

**Design doc:** `docs/plans/2026-04-14-unified-pricing-board-design.md`

**Skills:** pre-commit-validator, data-integrity-rules, supabase-deploy

---

### Task 1: Migration — Create unified tables + drop old ones

**Files:**
- Create: `supabase/migrations/20260418100100_unified_pricing_board.sql`

**Step 1: Write the migration**

The migration must, in order:
1. Create `posted_prices` table with all columns from the design doc (Section 1.1)
2. Create indexes: GIN on `target_fsa_codes`, btree on `(operator_id, posted_at DESC)`, btree on `(grain, posted_at DESC)`, btree on `(expires_at DESC)`
3. Enable RLS + create 2 policies (operator manages own, authenticated reads unexpired)
4. GRANT ALL to service_role, GRANT SELECT/INSERT/UPDATE/DELETE to authenticated
5. Create `operator_products` table (Section 1.2) with UNIQUE constraint on `(operator_id, product_name)`
6. Enable RLS + create policy (operator manages own)
7. GRANT to service_role + authenticated
8. Create `price_query_log` table (Section 1.3) with indexes
9. Enable RLS + create policy (operators read own logs)
10. GRANT SELECT to authenticated, GRANT ALL to service_role
11. Add `facility_status text` column to `profiles`
12. Add `user_role text` column to `feedback_log`
13. Create RPC `get_area_prices(p_fsa_code text, p_grain text DEFAULT NULL, p_business_type text DEFAULT NULL)` — JOIN `posted_prices` with `profiles` for facility_name + facility_status, return unexpired prices sorted by `is_sponsored DESC, posted_at DESC`. Include `hours_since_posted` computed column. GRANT EXECUTE to authenticated.
14. Create RPC `get_operator_analytics(p_days_back int DEFAULT 7)` — uses `auth.uid()` to scope to calling operator. Returns per-grain query counts for current period and previous period (same length). Computes trend. GRANT EXECUTE to authenticated.
15. Create RPC `get_operator_reach(p_fsa_codes text[])` — counts farmers in target FSAs. GRANT EXECUTE to authenticated.
16. Update `handle_new_user()` trigger to seed `operator_products` from `raw_user_meta_data->'products'` JSON array when present
17. Drop old RPCs: `get_elevator_prices_for_area`, `get_provider_listings_for_area`
18. Drop old tables: `elevator_prices`, `provider_listings`

```sql
-- Key design notes for the implementer:
-- get_area_prices must JOIN profiles to get facility_name and facility_status
-- get_operator_analytics must derive operator_id from auth.uid(), never accept it as parameter
-- get_operator_reach counts profiles WHERE role='farmer' AND LEFT(postal_code,3) = ANY(p_fsa_codes)
-- handle_new_user must handle the case where 'products' key doesn't exist in metadata (most signups)
-- Drop order: RPCs first (they reference tables), then tables
```

**Step 2: Run pre-commit validator check #6**

Run:
```bash
grep -c 'CREATE.*FUNCTION' supabase/migrations/20260418100100_unified_pricing_board.sql
grep -c 'GRANT EXECUTE' supabase/migrations/20260418100100_unified_pricing_board.sql
```
Expected: counts match (4 functions = `handle_new_user` trigger + 3 RPCs; 3 GRANTs for the RPCs — trigger doesn't need GRANT)

**Step 3: Verify local migration file exists**

Run: `ls supabase/migrations/ | tail -3`
Expected: `20260418100100_unified_pricing_board.sql` appears

**Step 4: Commit**

```bash
git add supabase/migrations/20260418100100_unified_pricing_board.sql
git commit -m "feat: unified pricing board migration (Track 39)

Creates posted_prices, operator_products, price_query_log tables.
Adds get_area_prices, get_operator_analytics, get_operator_reach RPCs.
Drops empty elevator_prices + provider_listings tables."
```

---

### Task 2: Chat tools — Replace 4 tools with 5 unified tools

**Files:**
- Modify: `supabase/functions/_shared/chat-tools.ts`

**Step 1: Replace tool definitions in CHAT_TOOLS array**

Remove these 4 tool definitions (lines 145-278 approximately):
- `save_elevator_prices` (line 145)
- `get_local_elevator_prices` (line 182)
- `save_provider_listing` (line 229)
- `get_provider_listings` (line 265)

Replace with 5 new tool definitions:

1. **`post_daily_prices`** — "Batch-save daily prices from an operator (elevator, crusher, seed company, fertilizer dealer, chemical company). Parse the operator's price sheet into structured entries. Supports fresh posts and quick-updates. Requires an operator role."
   - Parameters: `prices` array (each: `product_name`, `grade`, `price_per_tonne`, `price_per_bushel`, `basis`, `basis_reference`, `delivery_period`, `unit`, `capacity_notes`, `delivery_notes`, `special_offer`), `target_fsa_codes` (array, max 3)
   - Required: `prices`

2. **`get_area_prices`** — "Get posted prices for a farmer's area. Returns facility names, prices, basis, capacity, delivery notes, and facility status. Used when farmers ask about grain or input prices."
   - Parameters: `grain` (optional), `business_type` (optional, enum)
   - Required: none

3. **`manage_products`** — "Add or remove products from an operator's catalog. Called when an operator says they're starting to carry a new grain or dropping one."
   - Parameters: `action` (enum: 'add', 'remove'), `product_name`, `product_category` (optional)
   - Required: `action`, `product_name`

4. **`get_demand_analytics`** — "Show the operator how many farmers queried their prices, broken down by grain with weekly trend."
   - Parameters: `days_back` (integer, default 7)
   - Required: none

5. **`update_facility_status`** — "Update the operator's facility-wide status note. Shown to all farmers who ask about prices from this facility."
   - Parameters: `status` (string, max 200 chars)
   - Required: `status`

**Step 2: Update executor switch statement**

Remove old cases (lines 359-378):
- `case "save_elevator_prices"`
- `case "get_local_elevator_prices"`
- `case "save_provider_listing"`
- `case "get_provider_listings"`

Add new cases:
- `case "post_daily_prices"` → `postDailyPrices(supabase, ctx, args)`
- `case "get_area_prices"` → `getAreaPrices(supabase, ctx, args)` — also logs to `price_query_log`
- `case "manage_products"` → `manageProducts(supabase, ctx, args)`
- `case "get_demand_analytics"` → `getDemandAnalytics(supabase, ctx, args)`
- `case "update_facility_status"` → `updateFacilityStatus(supabase, ctx, args)`

**Step 3: Write implementation functions**

Remove old functions:
- `saveElevatorPrices` (lines ~810-895)
- `getLocalElevatorPrices` (lines ~897-940)
- `saveProviderListing` (lines ~990-1070)
- `getProviderListings` (lines ~1072-1120)

Replace with 5 new functions:

**`postDailyPrices`:**
- Role guard: check `OPERATOR_ROLES` set (elevator, crusher, mill, terminal, seed, fertilizer, chemical)
- Require `ctx.facilityName` or `ctx.companyName`
- Default target FSA from profile's `service_area_fsa` or `ctx.fsaCode`
- Max 3 FSA codes
- 24-hour default expiry
- Insert into `posted_prices`
- After insert, call `get_operator_reach` RPC and include farmer count in response
- Load yesterday's query counts and include as teaser: "Yesterday wheat was queried 14 times"

**`getAreaPrices`:**
- Require `ctx.fsaCode`
- Call `get_area_prices` RPC
- For each result returned, INSERT into `price_query_log` (operator_id, farmer_id=ctx.userId, grain, fsa_code)
- Format with `[posted pricing]` source tag, include capacity_notes, delivery_notes, facility_status
- Include `[sponsored]` tag for sponsored listings

**`manageProducts`:**
- Role guard: operator roles only
- `add`: INSERT into `operator_products` with ON CONFLICT DO UPDATE SET is_active = true
- `remove`: UPDATE `operator_products` SET is_active = false

**`getDemandAnalytics`:**
- Role guard: operator roles only
- Call `get_operator_analytics` RPC
- Format as grain ranking with counts and trend arrows

**`updateFacilityStatus`:**
- Role guard: operator roles only
- UPDATE `profiles` SET `facility_status` = args.status WHERE id = ctx.userId
- Confirm: "Noted — farmers will see: '[status]'"

**Step 4: Update OPERATOR_ROLES constant**

Replace the existing `PROVIDER_ROLES` set with a unified `OPERATOR_ROLES`:
```typescript
const OPERATOR_ROLES = new Set([
  "elevator", "crusher", "mill", "terminal",
  "seed", "fertilizer", "chemical"
]);
```

**Step 5: Commit**

```bash
git add supabase/functions/_shared/chat-tools.ts
git commit -m "feat: unified pricing tools — post_daily_prices, get_area_prices, manage_products, analytics

Replaces save_elevator_prices + get_local_elevator_prices +
save_provider_listing + get_provider_listings with 5 unified tools.
Adds demand analytics and facility status management."
```

---

### Task 3: Context builder — Load from unified table

**Files:**
- Modify: `supabase/functions/_shared/chat-context-builder.ts`

**Step 1: Merge `loadElevatorPrices` and `loadProviderListings` into `loadPostedPrices`**

Replace both loader functions with a single `loadPostedPrices` that calls the new `get_area_prices` RPC (no grain filter, no business_type filter — load all, cap at 15).

**Step 2: Update ChatContext interface**

Replace `elevatorPricing` and `providerListings` fields with a single `postedPrices` field.

**Step 3: Update DataFreshness interface**

Replace `elevatorPriceCount` and `providerListingCount` with a single `postedPriceCount`.

**Step 4: Update `buildChatContext` function**

- Replace the parallel load of `elevatorPrices` and `providerListings` with a single `loadPostedPrices` call
- Build a single `postedPrices` context string (grouped by business_type: grain prices first, then input prices)
- Include `facility_status` and `delivery_notes` in the formatted output

**Step 5: Update `computeTrustFooter`**

Replace `elevatorPricing` and `providerListings` labels with a single `postedPrices` label.

**Step 6: Commit**

```bash
git add supabase/functions/_shared/chat-context-builder.ts
git commit -m "refactor: unified posted prices in context builder

Merges elevator + provider loading into single loadPostedPrices.
Simplifies ChatContext interface and trust footer."
```

---

### Task 4: Edge Function — Update system prompt + profile loading

**Files:**
- Modify: `supabase/functions/chat-completion/index.ts`

**Step 1: Update profile SELECT**

Ensure the profile query includes `facility_status`. It already includes `company_name`, `provider_type`, `service_area_fsa` from previous work.

**Step 2: Update system prompt template**

- Replace `${context.elevatorPricing}` and `${context.providerListings}` with `${context.postedPrices}`
- Merge the operator section and provider section into a single `operatorSection` that handles all business types
- Quick-update instruction: "If the operator has expired prices from the last 24h, proactively show them and ask 'Same prices today, or anything change?'"

**Step 3: Update `isOperator` / `isProvider` logic**

Replace the two separate booleans with a single `isOperator` check:
```typescript
const isOperator = OPERATOR_BUSINESS_TYPES.has(userRole);
```
Where `OPERATOR_BUSINESS_TYPES = new Set(["elevator","crusher","mill","terminal","seed","fertilizer","chemical"])`.

**Step 4: Commit**

```bash
git add supabase/functions/chat-completion/index.ts
git commit -m "feat: unified operator mode in system prompt

Single operator section for all business types.
Quick-update flow instruction for daily pricing rhythm."
```

---

### Task 5: Signup form — Capture product line + postal code for all operators

**Files:**
- Modify: `components/auth/signup-form.tsx`

**Step 1: Add product line input**

After the FSA codes field (for both elevator and provider paths), add a "What do you buy/sell?" multi-line input:
- Elevators: "What grains do you buy?" placeholder: "Wheat, Canola, Barley, Oats"
- Input providers: "What products do you sell?" placeholder: "Urea, MAP, Glyphosate, InVigor L233P"

This is free-text, comma-separated. Parsed into individual product names at signup.

**Step 2: Update `handleSignup` to include products in metadata**

Parse the comma-separated input into an array. Include in `supabase.auth.signUp` options.data as `products`:
```typescript
products: productLine.split(",").map(s => s.trim()).filter(Boolean)
```

This flows through `handle_new_user()` trigger → seeds `operator_products`.

**Step 3: Add elevator-specific fields**

When role is `elevator` (or processor), show:
- Facility name (already exists)
- Facility type dropdown: elevator, crusher, mill, terminal
- Postal code (already exists)
- FSA codes (already exists, relabel to "Areas you serve")
- Grains you buy (new)

**Step 4: Unify the operator signup path**

Both elevator/processor and input provider signups follow the same layout:
- Company/facility name
- Postal code
- Service area (3 FSA codes)
- Products (grains they buy / products they sell)

The only difference: elevator types also pick a facility_type.

**Step 5: Commit**

```bash
git add components/auth/signup-form.tsx
git commit -m "feat: capture product line at operator signup

Adds grains/products field for all operator types.
Seeds operator_products via handle_new_user trigger."
```

---

### Task 6: Tests + Build + Deploy

**Files:**
- Modify: `lib/advisor/__tests__/system-prompt.test.ts` (if ChatContext type changed)

**Step 1: Run full test suite**

Run: `npm run test`
Expected: 214 tests pass (no test touches `elevator_prices` or `provider_listings` directly)

**Step 2: Run production build**

Run: `npm run build`
Expected: clean build, no type errors

**Step 3: Apply migration to production**

Run: `npx supabase db push --linked`
Expected: migration `20260418100100_unified_pricing_board.sql` applied

**Step 4: Deploy chat-completion Edge Function**

Run: `npx supabase functions deploy chat-completion --project-ref ibgsloyjxdopkvwqcqwh`
Expected: all `_shared/` files uploaded, function deployed

**Step 5: Verify in production**

```sql
-- Tables exist
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('posted_prices','operator_products','price_query_log');

-- Old tables gone
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('elevator_prices','provider_listings');

-- RPCs work
SELECT * FROM get_area_prices('T0L');
SELECT * FROM get_operator_reach(ARRAY['T0L','T0K','T0C']);

-- Old RPCs gone
-- get_elevator_prices_for_area should not exist
-- get_provider_listings_for_area should not exist

-- Role constraint correct
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%';

-- facility_status column exists
SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='facility_status';

-- user_role column on feedback_log
SELECT column_name FROM information_schema.columns WHERE table_name='feedback_log' AND column_name='user_role';
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Track 39 — Unified Pricing Board deployed

posted_prices, operator_products, price_query_log live.
elevator_prices + provider_listings dropped (0 rows).
5 unified chat tools, context builder, signup form updated."
```

---

### Task Dependency Graph

```
Task 1 (Migration)
  ↓
Task 2 (Chat tools) ──── Task 3 (Context builder)
  ↓                         ↓
Task 4 (System prompt — depends on Tasks 2+3)
  ↓
Task 5 (Signup form — independent but deploy together)
  ↓
Task 6 (Tests + Build + Deploy — gate)
```

Tasks 2 and 3 are independent and can run in parallel.
Task 4 depends on both 2 and 3 (uses the new ChatContext shape and references new tool names).
Task 5 is independent but ships in the same deploy.
Task 6 is the gate — nothing ships until tests + build pass.
