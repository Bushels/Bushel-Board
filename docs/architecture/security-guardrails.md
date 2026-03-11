# Security Guardrails

## Purpose

These are the non-negotiable rules for Bushel Board's auth, workflow, and farmer-facing data integrity.

## Edge Functions

- Public schedules may only enter through the Vercel cron route.
- Internal Edge Functions must require `x-bushel-internal-secret`.
- Internal chaining must never rely on `SUPABASE_ANON_KEY`, anon JWTs, or browser keys.
- Any function with `verify_jwt = false` must also require a shared secret and reject all other requests.

## RPC Functions

- User-scoped RPCs must derive the caller from `auth.uid()`.
- Service-only RPCs must revoke execute from `PUBLIC`, `anon`, and `authenticated`.
- Security definer functions must set `search_path = public`.
- If an RPC depends on caller identity, it must not accept a user ID parameter from the client.

## Row Level Security

- UI gating is advisory only. Real write restrictions must live in RLS and server actions.
- Farmer-only actions must enforce `profiles.role = 'farmer'`.
- Missing or malformed profiles must default to deny, not allow.

## Abuse Resistance

- High-volume authenticated mutations must call `consume_rate_limit()` before writing.
- The current minimum set is: delivery logging, sentiment voting, and signal feedback voting.
- Rate limit failures must return a user-facing retry message instead of failing silently.
- Delivery idempotency and rate limiting solve different problems; keep both.

## Crop Plan Math

- `volume_left_to_sell_kt` means current remaining inventory, not original plan volume.
- Farmer delivery events belong in `crop_plan_deliveries`; `crop_plans.deliveries` is a derived compatibility projection.
- Delivery pace and percentiles must use:

```text
delivered_kt / (delivered_kt + remaining_to_sell_kt)
```

- Any UI copy that says "planned volume" must be reviewed if it is sourced from `volume_left_to_sell_kt`.

## Supply Data

- `v_supply_pipeline` must produce one canonical row per `grain_slug, crop_year`.
- Do not hardcode source names like `AAFC_2025-11-24` in application queries.
- Use `v_supply_disposition_current` when the UI needs the latest canonical AAFC row.
- If multiple sources exist, prefer AAFC and then the latest `created_at`.
- Keep compatibility aliases when downstream code still expects historical column names.

## Dashboard Resilience

- Pages with many independent data sources must isolate them into separate sections.
- Do not let one failed query blank an entire farmer dashboard page.
- Server fetch helpers must not swallow Next.js dynamic-rendering bailout errors.
- Use section fallbacks when a card group is unavailable, and keep the rest of the page live.

## Release Checklist

- `npm run test`
- `npm run build`
- `npx supabase db push --linked`
- `npx supabase functions deploy import-cgc-weekly`
- `npx supabase functions deploy validate-import`
- `npx supabase functions deploy search-x-intelligence`
- `npx supabase functions deploy generate-intelligence`
- `npx supabase functions deploy generate-farm-summary`
- Confirm Vercel production has the same `BUSHEL_INTERNAL_FUNCTION_SECRET` as Supabase
- Confirm `SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';` returns zero rows
