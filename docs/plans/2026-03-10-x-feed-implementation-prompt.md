# X Feed & Relevance Scoring — Claude Code Implementation Prompt

Copy the section below into Claude Code to kick off the build.

---

## Prompt

Implement the X Feed & Relevance Scoring feature for Bushel Board. The full design doc is at `docs/plans/2026-03-10-x-feed-relevance-design.md` — read it first, it has the exact SQL, TypeScript interfaces, and UI specs.

### What to build (4 phases, in order)

**Phase 1 — Data layer (use db-architect agent)**

1. Create migration `supabase/migrations/20260310100000_signal_feedback.sql`:
   - `signal_feedback` table with columns: id (uuid PK), user_id (FK auth.users), signal_id (FK x_market_signals), relevant (boolean), user_province (text), user_crops (text[]), grain (text), crop_year (text), grain_week (int), voted_at (timestamptz). UNIQUE on (user_id, signal_id).
   - Indexes on signal_id, (grain, crop_year, grain_week), and user_id.
   - RLS: users insert/update/read own rows only. Service role reads all.

2. Create migration `supabase/migrations/20260310100100_signal_relevance_view.sql`:
   - `v_signal_relevance_scores` view that joins signal_feedback to x_market_signals.
   - Computes: total_votes, relevant_votes, not_relevant_votes, farmer_relevance_pct (0-100).
   - Blended score: when votes >= 3, use 60% grok_relevance + 40% farmer_relevance_pct. Under 3 votes, use grok_relevance alone.
   - No province breakdown columns needed (design decision: farmers don't see each other's votes).

3. Apply both migrations to Supabase project `ibgsloyjxdopkvwqcqwh`.

**Phase 2 — Query layer + server action (use frontend-dev agent)**

4. Extend `lib/queries/x-signals.ts`:
   - Add `XSignalWithFeedback` interface extending existing `XMarketSignal` with: user_voted, user_relevant, blended_relevance.
   - Add `getXSignalsWithFeedback(supabase, grainName, userId, grainWeek?)` — fetches signals LEFT JOINed with user's feedback, ordered by blended_relevance desc. Use a raw SQL query via `supabase.rpc()` or `.from()` with a join — whichever is cleaner.
   - Add `getUserFeedStats(supabase, userId, cropYear, grainWeek)` — returns total_signals, voted_count, relevant_count.

5. Create `app/actions/signal-feedback.ts`:
   - Server action `voteSignalRelevance(signalId, relevant, grain, cropYear, grainWeek)`.
   - Gets user via `supabase.auth.getUser()`.
   - Fetches user's province from `profiles` table and crops from `crop_plans`.
   - Upserts to `signal_feedback` with `onConflict: "user_id,signal_id"`.
   - Follow the exact pattern from the existing `app/actions/sentiment.ts`.

**Phase 3 — UI component (use frontend-dev agent)**

6. Build `components/dashboard/x-signal-feed.tsx` ("use client"):
   - Horizontal scrollable card strip using `overflow-x-auto` with `snap-x snap-mandatory`.
   - Each card shows: post_summary, post_author (@handle), post_date, sentiment badge (reuse colors from evidence-drawer), category pill.
   - Two vote buttons per card: "Relevant" (prairie green) and "Not for me" (wheat-300).
   - On vote: call `voteSignalRelevance` server action, optimistic UI update (mute card to opacity-70, show checkmark or X icon).
   - Already-voted cards start in voted state with option to change vote.
   - "Your impact" summary bar below the scroll: "You rated X/Y posts this week."
   - Empty state when no signals: "No market signals this week" with muted icon.
   - Follow existing design tokens: wheat palette, cubic-bezier(0.16, 1, 0.3, 1) easing, 40ms stagger.
   - Do NOT show other farmers' votes or consensus numbers — each farmer votes independently.
   - Do NOT link to X post URLs — summaries only.

7. Wire `XSignalFeed` into the grain detail page `app/(dashboard)/grain/[slug]/page.tsx`:
   - Fetch signals with feedback in the server component using `getXSignalsWithFeedback`.
   - Place below Intelligence KPIs, above Insight Cards.
   - Only show for authenticated users (the page already has auth context).

**Phase 4 — Pipeline integration (use db-architect agent)**

8. Modify `supabase/functions/generate-intelligence/index.ts`:
   - When fetching x_market_signals for a grain, LEFT JOIN with `v_signal_relevance_scores` to get blended_relevance.
   - Sort by blended_relevance desc instead of raw relevance_score.
   - Still use relevance >= 60 threshold, but on blended score.

9. Update `supabase/functions/generate-intelligence/prompt-template.ts`:
   - Add a "Farmer Validation" column to the X signals table in the prompt.
   - For signals with votes >= 3 and farmer_relevance_pct >= 70: label "farmer-validated".
   - For signals with votes >= 3 and farmer_relevance_pct < 40: label "farmer-dismissed".
   - For signals with < 3 votes: label "unrated".
   - Add instruction: "Posts marked 'farmer-validated' should be weighted heavily — real farmers confirmed these matter. Posts marked 'farmer-dismissed' should be deprioritized unless underlying data contradicts farmer sentiment."

### Key references
- Design doc: `docs/plans/2026-03-10-x-feed-relevance-design.md`
- Existing sentiment voting pattern to follow: `components/dashboard/sentiment-poll.tsx` + `app/actions/sentiment.ts` + `lib/queries/sentiment.ts`
- Existing evidence drawer to reference for card styling: `components/dashboard/evidence-drawer.tsx`
- Existing X signals query: `lib/queries/x-signals.ts`
- Intelligence Edge Function: `supabase/functions/generate-intelligence/index.ts`
- Prompt template: `supabase/functions/generate-intelligence/prompt-template.ts`

### Agent assignments
- **db-architect**: Phase 1 (migrations) and Phase 4 (Edge Function changes)
- **frontend-dev**: Phase 2 (query layer + server action) and Phase 3 (UI component)

### Don't forget
- Run `npm run build` after Phase 3 to verify no TypeScript errors.
- Test the migration against the live Supabase project before moving to Phase 2.
- The `profiles` table has a `province` column — verify it exists before the server action relies on it. If not, check what column stores the user's location and adjust.
- Crop year format in this feature should match what `x_market_signals` uses: `"2025-26"` (short format).
