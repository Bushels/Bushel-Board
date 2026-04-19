# Bio Trial Signup — Feature Reference

**Status:** Shipped (2026-04-18). Live on the public landing page at `/`.
**Supersedes in practice:** Phase 3 of `docs/plans/2026-04-18-bio-trial-integration-design.md`.
**Owner context:** 2026 Buperac/BioLift foliar biostimulant trial. Lead capture on the homepage; fulfillment handled by SixRing (vendor console is a separate, later phase).

> **Purpose of this doc:** Anyone modifying the landing page, middleware, Supabase RPCs, or the email pipeline needs to read this *before* changing code. The feature has several non-obvious constraints (Next.js server actions were deliberately rejected for the submit path, the API route is deliberately exempt from auth middleware, the Resend sender is in sandbox mode). Breaking any of them regresses either the UX or the notification email silently.

---

## TL;DR — What this feature does

A farmer fills out the sticky-note trial form inside `<TrialDeskSection>` on `/`. On submit:

1. The browser calls `public.submit_bio_trial_signup` **directly** via the Supabase anon client. A row lands in `bio_trial.signups`; the RPC returns the new running-total acres.
2. The UI stamps **APPROVED** and rolls the brass odometer to the new total. This must feel instant.
3. The browser *then* fires a best-effort `POST /api/trial-notify` with the full payload. The API route renders an HTML + plain-text email and ships it via Resend to `TRIAL_NOTIFY_TO`. A failure here never affects the user — the signup is already in Postgres.

```
┌────────┐   RPC (anon key)     ┌──────────────┐
│ Browser├─────────────────────▶│ Supabase RPC │───▶ bio_trial.signups row
└────┬───┘   submit_bio_...     └──────────────┘
     │
     │  (UI renders APPROVED + odometer rolls here — zero server roundtrip)
     │
     │  fetch keepalive:true    ┌──────────────────────────┐   Resend API
     └─────────────────────────▶│ /api/trial-notify (Node) ├──────────────▶ kyle@bushelsenergy.com
                                └──────────────────────────┘
```

Nothing blocks the odometer roll or the APPROVED stamp on the notification round trip. That is deliberate — see [Critical invariants](#critical-invariants).

---

## File inventory

Every file that participates in the trial signup flow. Modifying any of these **must** be done with this doc open.

### Frontend (client-side, runs in the browser)

| File | Purpose | Notes |
|---|---|---|
| `components/landing/trial-desk-section.tsx` | Client component that composes the hero, sticky-note benefits, and clipboard signup form. Mounts `<TrialOdometer>` and `<TrialForm>`. On mount, re-fetches `get_bio_trial_acres` so a stale SSR value rolls forward. | `"use client"`. Holds the `odometerRef` passed into `<TrialForm>`. |
| `components/landing/trial-form.tsx` | Controlled form with crop checkboxes, acres input, logistics radio, ship-to block. Submits via `submitTrialSignupClient`, then fires the notification POST. | `"use client"`. Uses `useTransition` so the submit button stays responsive. Calls `trackEvent("trial_signup", …)` (GA4) on success. |
| `components/landing/trial-client.ts` | Browser-side Supabase RPC wrappers: `submitTrialSignupClient(input)` and `getEnrolledAcresClient()`. Zod-validates the payload before the RPC call. | `"use client"`. **This is the hot path for the submit UX** — see [Why not server actions](#why-not-server-actions). |
| `components/landing/trial-odometer.tsx` | Brass six-digit odometer. Imperative handle exposes `rollTo(nextValue)`. | Client component; physics-based rotate animation ported from the original standalone `bio_trial/` site. |
| `components/landing/trial-desk.css` | All agronomist-desk styling (kraft paper, sticky notes, clipboard, masking tape, rubber stamp). Scoped under the `.trial-desk` parent class — **must not leak into the rest of the site**. | Plain CSS, not Tailwind. Imported only by `trial-desk-section.tsx`. |
| `components/landing/landing-page.tsx` | Root landing component. Renders `<PrairieScene>`, hero, community stats, then `<TrialDeskSection initialAcres={…} />`. | Feature-grid/"three cards" block was intentionally removed 2026-04-18; don't put it back without product approval. |

### Server-side supporting files

| File | Purpose | Notes |
|---|---|---|
| `app/page.tsx` | Root route. SSR-fetches `getCommunityStats()` and `getEnrolledAcres()` in parallel and passes both to `<LandingPage>`. | Still uses `getEnrolledAcres` (the server-action helper) for SSR. Do not switch this to `getEnrolledAcresClient` — that function is browser-only. |
| `components/landing/trial-actions.ts` | Server-action twin: `submitTrialSignup()` and `getEnrolledAcres()`. | **Submit flow no longer uses `submitTrialSignup`**, but the file stays because `getEnrolledAcres()` is still the SSR path. Deleting `submitTrialSignup` is safe; keeping it costs nothing. |
| `app/api/trial-notify/route.ts` | Node-runtime `POST` endpoint. Zod-validates the body, renders an HTML+plain email, sends via the Resend SDK. Returns 400/500/502 on failure, 200 `{ok, id}` on success. | `export const runtime = "nodejs"` (Resend SDK uses Node built-ins). `export const dynamic = "force-dynamic"` so it never gets cached. |
| `lib/supabase/middleware.ts` | Auth middleware. **Explicitly exempts `/api/trial-notify`** so unauthenticated browsers can POST to it. | See the `pathname.startsWith("/api/trial-notify")` check. Touching this list without reading the context comment is how this feature gets broken. |
| `lib/supabase/client.ts` | Browser Supabase client factory. Used by `trial-client.ts` and `trial-desk-section.tsx`. | Generic — not trial-specific. |
| `lib/supabase/server.ts` | Server Supabase client factory. Used by `trial-actions.ts`, `app/page.tsx`. | Generic. |

### Database (Supabase project `ibgsloyjxdopkvwqcqwh`)

| Object | Shape | Notes |
|---|---|---|
| `bio_trial.signups` | Table. Columns include `id uuid`, `name`, `farm_name`, `email`, `phone`, `province_state`, `rm_county`, `crops text[]`, `crops_other`, `acres int`, `price_cents`, `logistics_method`, `delivery_*`, `status` (default `'new'`), `source`, `created_at`. | Not touched by the app directly — only the RPCs read/write it. |
| `public.submit_bio_trial_signup(payload jsonb) RETURNS int` | `SECURITY DEFINER`, `search_path: public, bio_trial`. Normalizes (uppercases province, lowercases email, trims whitespace), hard-codes `price_cents := 280`, inserts the row, returns the new `sum(acres)` as of after-insert. | Callable by anon. **Never call `bio_trial.signups` directly from the app** — always go through this RPC. |
| `public.get_bio_trial_acres() RETURNS int` | `SECURITY DEFINER`, `STABLE`. Returns current `sum(acres) FROM bio_trial.signups`. | Callable by anon. |

Both RPCs are already grant-locked correctly; do not modify the grants.

---

## Critical invariants

Anything in this list, if violated, breaks the feature in ways that don't show up in CI. Read every one before editing.

### 1. The submit path does not go through a Next.js server action

**What:** `<TrialForm>` calls `submitTrialSignupClient` from `trial-client.ts`, which uses the browser Supabase client. It does **not** call `submitTrialSignup` from `trial-actions.ts`.

**Why:** Next.js 15/16 server actions trigger an RSC revalidation of the calling route after they resolve. Because `app/page.tsx` is dynamic (it does `supabase.auth.getUser()` + parallel fetches of community stats + enrolled acres), that revalidation added multi-second delay between clicking the rubber stamp and the APPROVED state rendering. The browser round-trip to Supabase is ~200–400 ms and skips Next's RSC pipeline entirely.

**If you "simplify" this by merging the paths back:** verify the submit-to-APPROVED latency in a real browser (not localhost) after the change. If it's slower than ~500 ms, revert.

See [Why not server actions](#why-not-server-actions) for the long form.

### 2. The notification POST is fire-and-forget

**What:** After `submitTrialSignupClient` resolves successfully, the form does a bare `void fetch("/api/trial-notify", { keepalive: true, ... }).catch(…)`. The UI's `success` state is set **before** the fetch resolves.

**Why:** The signup row is already durable in Postgres at that point. Email is a downstream courtesy. If Resend is having a bad day, the farmer should still see APPROVED and the odometer should still roll.

**Do not** `await` the email POST. **Do not** gate `setSuccess(true)` on it. If you add retries, add them inside the API route or via a queue — not in the browser.

### 3. `/api/trial-notify` must stay on the public-route exemption list

**What:** `lib/supabase/middleware.ts` contains:

```ts
!request.nextUrl.pathname.startsWith("/api/trial-notify")
```

in the "don't redirect unauthenticated requests" guard.

**Why:** The trial page is public (unauthenticated). Without this exemption, the browser's fire-and-forget POST gets a 307 redirect to `/login` and the email never sends. This was observed and fixed during the 2026-04-18 end-to-end test.

### 4. The Resend sender is in sandbox mode — `TRIAL_NOTIFY_TO` can only be the Resend account owner

**What:** `TRIAL_NOTIFY_TO` is currently `kyle@bushelsenergy.com`. The `from` address falls back to `Bushel Board <onboarding@resend.dev>`.

**Why:** Resend's shared sender (`onboarding@resend.dev`) only delivers mail to the email address on the Resend account itself. Sending to `buperac@gmail.com` (or anything else) returns a 502 with *"You can only send testing emails to your own email address."*

**How to get off the sandbox:**
1. Verify a domain at [resend.com/domains](https://resend.com/domains) (e.g. `bushelsenergy.com` or a Buperac-owned domain).
2. In Vercel, add `TRIAL_NOTIFY_FROM="Bushel Board <trials@yourdomain>"` using an address on the verified domain.
3. Change `TRIAL_NOTIFY_TO` to the real destination (e.g. `buperac@gmail.com`).
4. No code change is needed — the API route already reads `process.env.TRIAL_NOTIFY_FROM` with the sandbox fallback.

### 5. The `.trial-desk` CSS scope is load-bearing

**What:** Everything in `trial-desk.css` is either scoped under `.trial-desk` or uses a distinctive class prefix (`.marker-head`, `.stamp-*`, `.note`, `.clipboard`, `.form-*`, `.rubber-stamp`, `.td-*`). The CSS variables (`--kraft`, `--ink`, etc.) are declared on `.trial-desk` too.

**Why:** The rest of the Bushel Board app uses Tailwind + shadcn. If trial styles leak (e.g. a stray `.note` rule), they will visually pollute the dashboard and the auth screens. Conversely, Tailwind utility reset can override unscoped trial styles.

**Rule:** every new selector in `trial-desk.css` starts with `.trial-desk` (or is a child of one that does). The one known pre-existing bug — `.note h3` targeting markup that renders `<h4>` — was fixed in 2026-04-18 and the selector now reads `.trial-desk .note h4`.

### 6. `bio_trial.signups` writes go through `submit_bio_trial_signup` only

Never write to `bio_trial.signups` directly from app code. The RPC normalizes and authoritatively sets the `$2.80/ac` price (`v_price_cents := 280`). Direct inserts will drift from that invariant.

---

## Environment variables

All of these live in Vercel (production + preview) **and** `.env.local` (development). `.env*` is gitignored; treat this table as the source of truth for what must be set.

| Var | Required? | Purpose | Typical value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. Shared with the rest of the app. | `https://ibgsloyjxdopkvwqcqwh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser anon key. Used by `trial-client.ts` to call the public RPCs. | `sb_publishable_…` |
| `RESEND_API_KEY` | yes (for email) | Server-only Resend key. Read in `app/api/trial-notify/route.ts`. | `re_…` |
| `TRIAL_NOTIFY_TO` | yes (for email) | Destination address for trial-signup notifications. In sandbox mode, **must** match the Resend account owner. | `kyle@bushelsenergy.com` |
| `TRIAL_NOTIFY_FROM` | optional | Override the `from` header. If unset, falls back to `Bushel Board <onboarding@resend.dev>` (Resend sandbox). Required once you move off sandbox. | `Bushel Board <trials@bushelsenergy.com>` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional | GA4 measurement ID. When set, `trackEvent('trial_signup', …)` fires on successful submit. | `G-XXXXXXX` |

If `RESEND_API_KEY` or `TRIAL_NOTIFY_TO` is missing, `/api/trial-notify` returns HTTP 500 with `{ok: false, error: "Email is not configured on this server."}` and the signup row is still saved. The user UI is unaffected.

> **API key rotation advisory:** The initial Resend key was pasted into a chat transcript during development. Best practice is to rotate it in the Resend dashboard and replace the value in Vercel + `.env.local`. No code changes required.

---

## Zod schemas (client and server agreement)

Both `trial-client.ts` (browser submit) and `app/api/trial-notify/route.ts` (email) Zod-validate their inputs. The schemas are **intentionally duplicated** because they serve different trust boundaries:

- `trial-client.ts` validates the form before the RPC call. Bad input short-circuits to a user-visible error string; no RPC call is made.
- `app/api/trial-notify/route.ts` re-validates because the endpoint is publicly reachable — we cannot assume a malicious caller sent the shape we want. Returns 400 on mismatch.

If you add or rename a form field, you must update **three** places: the form JSX in `trial-form.tsx`, the schema in `trial-client.ts`, and the schema in `app/api/trial-notify/route.ts`. There is currently no shared schema module; this is acceptable because the fields drift rarely.

The Supabase RPC itself is the final validation authority — it silently drops unknown keys and coerces types. App-side Zod is for UX (early errors) and defensive hygiene, not security.

---

## Why not server actions? (long form)

The history, so future sessions don't repeat the loop:

1. **First version** used a Next.js server action (`trial-actions.ts → submitTrialSignup`) from the form's `useTransition` callback.
2. **Symptom:** after clicking the rubber stamp, the APPROVED state took multiple seconds to render. The odometer rolled late.
3. **Diagnosis:** server actions trigger an RSC revalidation of the current route after they resolve. `/` (`app/page.tsx`) is dynamic and fans out to `supabase.auth.getUser()`, `getCommunityStats()`, `getEnrolledAcres()`. Every submit was re-running that whole tree on the server before the client could render the success UI.
4. **Fix:** moved the RPC call into the browser via `@supabase/ssr`'s client factory. The anon key is already exposed to the browser (it's `NEXT_PUBLIC_*`), the RPC is `SECURITY DEFINER` for public callers, so there's no security downgrade. Net: ~200–400 ms roundtrip, no RSC revalidation, APPROVED state renders immediately.
5. **Left `trial-actions.ts` in place** because `getEnrolledAcres()` is still used for the initial SSR render in `app/page.tsx`. The server-side read is fine there — it runs once on the page render, not on every user interaction.

**If a future session considers reintroducing a server action here:** there is no code-hygiene reason that justifies the UX regression. The code savings (one file vs. two nearly-identical files) aren't worth the multi-second submit delay.

---

## Testing checklist

Run these before shipping any change that touches any file in the inventory above.

### Manual end-to-end (browser)

1. Load `/` as a fresh unauthenticated user. Landing page renders; odometer shows the live enrolled-acres value; sticky-note form is visible without scrolling past the benefits on desktop and on a 375-px wide viewport.
2. Fill every required field. Toggle "Ship to me" — the address block appears and its fields become required.
3. Click the rubber stamp. Within ~1 s:
   - Button text flips to "Stamping…" then the form replaces itself with the **APPROVED** stamp + "Thanks — you're on the list."
   - The odometer rolls from its prior value to the new total (your acres added).
   - The page scrolls to the odometer anchor.
4. In a separate tab, check the Supabase Studio `bio_trial.signups` table — your row is there with `status: new` and `price_cents: 280`.
5. Check `kyle@bushelsenergy.com` (or whatever `TRIAL_NOTIFY_TO` is set to). The kraft-paper-styled email arrives within a few seconds. Reply — the `replyTo` header should message the farmer's address, not the sender.

### Negative path

- Submit with no crops selected → inline error "Pick at least one crop".
- Submit with acres = 0 → "Acres must be at least 1".
- Temporarily unset `RESEND_API_KEY` and submit → the row still lands in Postgres; the odometer still rolls; the email POST returns 500 but the user never sees it.
- Temporarily break the RPC (e.g. revoke grant in a preview project) → the user sees a generic error, no APPROVED stamp, no row written. This is the only path that *should* block the UX.

### Network-level sanity

In DevTools → Network:
- `submit_bio_trial_signup` request returns 200 with a numeric body.
- `/api/trial-notify` request returns 200 with `{ok: true, id: "…"}`.
- No 307 redirects on either (if you see a 307 to `/login` for `/api/trial-notify`, you've broken the middleware exemption — see invariant #3).

---

## Deployment checklist (Vercel)

When rolling the feature to a fresh environment:

- [ ] `RESEND_API_KEY`, `TRIAL_NOTIFY_TO` set in Vercel env. `TRIAL_NOTIFY_FROM` optional (defaults to sandbox sender).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` match the target Supabase project.
- [ ] Supabase project has `bio_trial.signups` table, `submit_bio_trial_signup`, and `get_bio_trial_acres` — all from the `2026-04-18-bio-trial-integration-design.md` phase 3 migrations.
- [ ] Middleware exemption for `/api/trial-notify` is present.
- [ ] Optional: `NEXT_PUBLIC_GA_MEASUREMENT_ID` set if you want the `trial_signup` custom event in GA4.

---

## Known follow-ups (not yet done)

- **Domain verification in Resend** — move off `onboarding@resend.dev` so we can send to `buperac@gmail.com` (or wherever the real ops inbox lives).
- **Rate-limiting on `/api/trial-notify`** — the route is public and un-rate-limited. Not a problem at current traffic, but a determined attacker could spam the inbox. Either a Postgres rate-limit table or an upstream edge-middleware check would fix it.
- **Admin vendor console (phase 4 of the design doc)** — not yet implemented. Signups currently only surface via the `bio_trial.signups` table + the notification email.
- **Test row cleanup** — there is one deliberate E2E test row (`Claude E2E Test` / `claude-e2e@example.com` / 25 acres) from 2026-04-18. Delete whenever it becomes noise.

---

## Quick reference — where to change what

| I want to… | Edit this |
|---|---|
| Add/rename a form field | `trial-form.tsx` + `trial-client.ts` schema + `app/api/trial-notify/route.ts` schema |
| Change the trial price per acre | Supabase RPC `submit_bio_trial_signup` (the `v_price_cents := 280` line) + the display strings in `trial-form.tsx` and `app/api/trial-notify/route.ts` |
| Change the email destination | `TRIAL_NOTIFY_TO` env var (Vercel + `.env.local`) |
| Change the email template | `app/api/trial-notify/route.ts` (both the `html` and `plain` strings) |
| Move the section on the page | `components/landing/landing-page.tsx` (`<TrialDeskSection>` placement) |
| Adjust the odometer animation | `trial-odometer.tsx` |
| Tweak the sticky-note / clipboard visuals | `trial-desk.css` (stay inside the `.trial-desk` scope) |
| Change the "APPROVED" success UI | `trial-form.tsx` (the `if (success)` early return) |
