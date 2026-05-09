# Bio Trial Integration into Bushel Board — Design Doc

> **⚠️ DEPRECATED 2026-04-28.** This feature was retired with the public-first auth pivot (STATUS Track 47). The Prairie Landing Page (Track 13), the bio-trial signup flow (Track 45), and the `/api/trial-notify` endpoint were deleted. Phases 4–6 below were never implemented and will not be. The Supabase RPCs `public.submit_bio_trial_signup` / `public.get_bio_trial_acres` remain in the database with no app-side caller. **Do not implement anything from this doc.** Kept for historical reference and possible future seasonal-trial revival.

**Author:** Claude (Opus 4.7) • **Date:** 2026-04-18 • **Status:** Retired 2026-04-28 (originally: approved, in progress)

> **Shipped-state reference (phases 1–3):** See [`docs/reference/bio-trial-signup.md`](../reference/bio-trial-signup.md) before modifying any file in the trial signup flow. That doc captures the current-as-of-ship architecture, env vars, and critical invariants (why the submit path deliberately does *not* use a Next.js server action, why `/api/trial-notify` is exempt from auth middleware, Resend sandbox constraint, etc.). Phases 4–6 below are not yet implemented.

## TL;DR

Fold the 2026 Buperac foliar biostimulant trial into the Bushel Board app so the trial, the vendor ops console, and the eventual trial-member dashboard share one Vercel deploy, one Supabase project, and one auth flow. The standalone `bio_trial/` static site becomes reference-only.

Concretely:

1. Homepage (`/`) keeps the current Bushel Board hero but gains an agronomist-desk **trial section** below it with the sticky-note form + odometer, calling `public.submit_bio_trial_signup`.
2. SixRing vendor portal lives at `/admin`, gated by `bio_trial.is_vendor()`, with RPCs `public.list_bio_trial_signups` / `public.vendor_update_bio_trial_signup`.
3. Trial participants (post-delivery) log in to a flagged version of the dashboard with chat unlocked. Non-trial users see chat greyed out with a "Trial only" tooltip.
4. Google Analytics 4 instruments the whole site so we can attribute trial signups to sources from day one.

## Why now

- Kyle does not want to pay for another domain (`trial.buperac.com`, etc.) for an experiment that may or may not generate engagement — running on `bushel-board-app.vercel.app` piggybacks on an already-paid deploy.
- Eventual trial → Bushel Board promotion is frictionless if the trial already lives in the same app — farmers don't re-learn a second UI.
- SixRing (the vendor fulfilling orders) needs a shared-login admin UI; they don't need a whole separate app. One `/admin` route behind `is_vendor()` is the thinnest viable ops console.
- Using the trial as the forcing function to ship **chat feature gating** means we get a real-world "some users have access, some don't" moment — which we'll need anyway when Bushy goes from alpha to tiered access.

## Current state

- **`bio_trial/` standalone static site** — deploys to Vercel, lead capture only. Backend already lives in Bushel Board's Supabase project (`ibgsloyjxdopkvwqcqwh`): `bio_trial.signups` table, `public.submit_bio_trial_signup` / `public.get_bio_trial_acres` RPCs, `bio_trial.vendor_users` + `bio_trial.is_vendor()` gate, `bio-trial-notify-signup` edge function, DB trigger posting to the function on every new signup.
- **Bushel Board app** — Next.js 16 App Router, `@supabase/ssr`, `/` renders `<LandingPage>` (PrairieScene + "Set Up My Farm" CTA → `/signup`), `/signup` + `/login` + `/reset-password` under `(auth)`, real dashboard under `(dashboard)` with `/advisor`, `/chat`, `/digest`, `/grain`, `/my-farm`, `/overview`, `/us`. Roles modeled in `profiles.role` (`farmer` | `observer` | operator variants). No admin surface exists yet.
- **Analytics** — none. No GA, no posthog, no segment. Every page view and signup conversion has been invisible.

## Phase plan

Each phase is a clean commit point. Phases 1–2 are **done in this doc's branch**; 3–6 follow.

### Phase 1 — Google Analytics 4 (done)

- `components/analytics/google-analytics.tsx`: loads gtag.js via `next/script` (strategy `afterInteractive`), fires `page_view` on App Router route changes (client hook using `usePathname` + `useSearchParams`, wrapped in `Suspense`). Exports `trackEvent(name, params)` helper for custom events.
- Mounted once in `app/layout.tsx`.
- Env var `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Unset → component renders null (no errors, no network calls).
- Follow-up (Phase 3): `trackEvent('trial_signup', { acres, logistics_method })` fires on form submit.

### Phase 2 — This design doc (done)

Reference for the eventual big-audit pass.

### Phase 3 — Homepage trial section

- Refactor `components/landing/landing-page.tsx` → keep hero + ProofPills + feature blocks; insert a new `<TrialDeskSection>` between the hero and the feature grid.
- New files:
  - `components/landing/trial-desk-section.tsx` — server component wrapper, fetches current enrolled acres via `get_bio_trial_acres` RPC.
  - `components/landing/trial-form.tsx` — client component; port the form from `bio_trial/index.html`, submit via a server action that calls `submit_bio_trial_signup`.
  - `components/landing/trial-odometer.tsx` — brass odometer (port CSS from `bio_trial/styles.css`, React-ify the rotate logic from `bio_trial/app.js`).
- Assets: copy `bio_trial/uploads/*` → `public/trial/`. Reference under `/trial/<file>`.
- Styling: scope the agronomist-desk aesthetic to the section only (sticky notes + kraft paper + masking tape). Does not leak into the rest of the site.
- Analytics: fire `trackEvent('trial_signup', { acres, logistics_method, crops })` on successful submit.

### Phase 4 — Admin portal at `/admin`

- New route group `app/(admin)/admin/page.tsx`. Middleware check redirects non-vendors to `/`.
- New RPCs (migration `bio_trial_vendor_rpcs`):
  - `public.list_bio_trial_signups()` → returns rows with status, acres, logistics, address, payment, shipping, delivery columns. Gated by `bio_trial.is_vendor()`.
  - `public.vendor_update_bio_trial_signup(id uuid, patch jsonb)` → accepts `{payment_status, payment_confirmed_at, liters_purchased, product_shipped_at, product_delivered_at, vendor_notes}` and updates only the whitelisted columns.
- UI: plain table, sortable by `created_at` desc default. Inline action buttons per row: "Mark paid" / "Record liters" (modal w/ number input) / "Mark shipped" / "Mark delivered". Free-text `vendor_notes` field behind a collapsible row details.
- Post-auth routing: extend `getPostAuthDestination` so vendors (`is_vendor() = true`) land on `/admin` instead of `/overview`.
- SixRing onboarding: one-off migration creates an `auth.users` row with a dummy password + the `bio_trial.vendor_users` mapping; Kyle triggers a password reset for Eric via the Supabase dashboard to set the real shared password.

### Phase 5 — Trial-member flag + chat gating

- Schema: `alter table profiles add column is_trial_participant boolean default false, add column bio_trial_signup_id uuid references bio_trial.signups(id)`.
- Update `handle_new_user()` trigger: if `raw_user_meta_data` carries `bio_trial_signup_id`, copy it onto the profile and set `is_trial_participant = true`.
- `lib/auth/role-guard.ts`: add `isTrialParticipant(supabase)` helper.
- `components/dashboard/nav.tsx` (wherever the chat link lives): when `!isTrialParticipant`, render the chat entry with `opacity-50 pointer-events-none` + tooltip "Trial participants only — joining soon".

### Phase 6 — Delivery → magic-link invite

- `public.vendor_update_bio_trial_signup` detects the `product_delivered_at` transition (null → timestamp). On transition, fire-and-forget call to a new edge function `bio-trial-invite-farmer` via `pg_net`.
- Edge function:
  1. Uses service role to call `auth.admin.inviteUserByEmail(signup.email, { data: { bio_trial_signup_id: signup.id } })`.
  2. On success, stamp `bio_trial.signups.access_granted_at`.
  3. Resend notification to Kyle + Eric: "Invite sent to X".
- `handle_new_user()` picks up `bio_trial_signup_id` from metadata, sets `is_trial_participant = true` on the new profile row.

### Phase 7 — Retire `bio_trial/` standalone deploy

- Pause the Vercel project for the standalone site (do not delete — keeps rollback path).
- Update `bio_trial/README.md` to note it is reference-only and production lives on Bushel Board.

## Schema changes summary

| Change | Migration | Phase |
|---|---|---|
| `public.list_bio_trial_signups()` | `bio_trial_vendor_rpcs` | 4 |
| `public.vendor_update_bio_trial_signup(id, patch)` | `bio_trial_vendor_rpcs` | 4 |
| Extend `getPostAuthDestination` for vendors | N/A (TS only) | 4 |
| `profiles.is_trial_participant` / `profiles.bio_trial_signup_id` | `profiles_trial_flag` | 5 |
| `handle_new_user()` trigger update | `handle_new_user_trial_aware` | 5 |
| Delivery trigger → `bio-trial-invite-farmer` edge function | `bio_trial_invite_on_delivery` | 6 |

## Out of scope (for now)

- Bushy system-prompt injection of trial context — belongs in a separate design doc after Phase 6 ships and we have real conversations to observe.
- Farmer-facing "check my trial status" page. If Eric + Kyle need to answer "where is my order?" questions out of band for v0, it's fine. Revisit after 5+ signups.
- Trial-cohort analytics dashboards (who responded to what touchpoint, conversion funnels beyond signup). GA + manual SQL cover it until volume justifies more.

## Risks

- **Shared-login password hygiene** — one password for SixRing means rotation is manual and anyone who leaves Eric's team still has access. Mitigation: document rotation cadence in `/admin` README; tolerate for v0 because the blast radius is "can see trial signup names and flip statuses", not access to farmer dashboards.
- **`is_trial_participant` false-negatives** — if `handle_new_user()` runs before we've extended it to read signup metadata, an invited trial farmer lands on the dashboard with chat still locked. Mitigation: ship Phase 5 before Phase 6.
- **GA data lag on Vercel previews** — preview deploys inherit the production env var unless we override. If we don't want preview pageviews polluting prod GA, we either set a different measurement ID on preview or gate the component on `process.env.VERCEL_ENV === "production"`. Decision: for v0 accept the noise, filter in GA by hostname later.

## Definition of done (per-phase)

1. `npm run build` passes.
2. Affected pages verified in browser or via Claude Preview — no console errors.
3. Any DB change tested with a SELECT against the migrated schema.
4. STATUS.md gets a new feature track row when Phase 7 closes.
5. A single `data-audit` + `security-auditor` agent pass after Phase 7, before the formal launch. (Lighter gates agreement with Kyle — 2026-04-18.)
