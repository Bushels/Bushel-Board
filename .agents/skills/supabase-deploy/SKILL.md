---
name: supabase-deploy
description: >
  Deploy Supabase Edge Functions and apply database migrations for Bushel Board.
  Use when the user says: 'deploy the edge function', 'push the migration', 'apply migrations',
  'deploy functions', 'update the database schema', 'push schema changes', 'the function is out of date',
  'deploy to Supabase', 'supabase deploy', 'sync the Edge Functions'.
  Do NOT use for: triggering the CGC import (use cgc-import skill), generating grain reports
  (use grain-report skill), or general Supabase SQL queries (use Supabase MCP directly).
---

# Supabase Deploy Skill — Bushel Board

Deploy Edge Functions and manage database migrations for the Bushel Board Supabase project.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Edge Functions (5 total):**
  - `import-cgc-weekly` — fetches CGC CSV, upserts grain_observations
  - `validate-import` — runs anomaly checks, writes to validation_reports
  - `search-x-intelligence` — X/Twitter search via xAI for market sentiment
  - `generate-intelligence` — per-grain AI narratives via Grok
  - `generate-farm-summary` — per-user weekly farm summaries + percentiles
- **Migrations path:** `supabase/migrations/`
- **Secrets:** stored in Supabase Vault; local dev in `.env.local` (gitignored)

## Deploy Commands

### Deploy a single Edge Function
```bash
npx supabase functions deploy <function-name> --project-ref ibgsloyjxdopkvwqcqwh
```

### Deploy all Edge Functions
```bash
npx supabase functions deploy --project-ref ibgsloyjxdopkvwqcqwh
```

### Apply migrations (remote)
```bash
npx supabase db push --project-ref ibgsloyjxdopkvwqcqwh
```

### Check migration status
```bash
npx supabase db diff --project-ref ibgsloyjxdopkvwqcqwh
```

### List applied migrations (via Supabase MCP)
Use `list_migrations` with project_id `ibgsloyjxdopkvwqcqwh`.

### Manage secrets
```bash
# List all secrets
npx supabase secrets list --project-ref ibgsloyjxdopkvwqcqwh

# Set a secret
npx supabase secrets set KEY=value --project-ref ibgsloyjxdopkvwqcqwh
```

**Required secrets for Edge Functions:**
| Secret | Used by |
|--------|---------|
| `XAI_API_KEY` | `search-x-intelligence`, `generate-intelligence`, `generate-farm-summary` |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions (auto-injected) |
| `SUPABASE_URL` | All functions (auto-injected) |

## Workflow

### 1. Deploying a new or updated Edge Function
1. Make changes to `supabase/functions/<name>/index.ts`
2. Run `npx supabase functions deploy <name> --project-ref ibgsloyjxdopkvwqcqwh`
3. Verify with `npx supabase functions list --project-ref ibgsloyjxdopkvwqcqwh`
4. Smoke test by checking `net._http_response` after a manual trigger:
   ```sql
   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
   ```

### 2. Applying a new migration
1. Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Run `npx supabase db push --project-ref ibgsloyjxdopkvwqcqwh`
3. Verify with `list_migrations` MCP tool
4. Test affected views/tables via `execute_sql`

### 3. Adding a new secret
1. `npx supabase secrets set NEW_KEY=value --project-ref ibgsloyjxdopkvwqcqwh`
2. Reference in Edge Function: `Deno.env.get('NEW_KEY')`
3. Add placeholder to `.env.local.example` (never the real value)

## Examples

- **User:** "Deploy the generate-intelligence function"
  → `npx supabase functions deploy generate-intelligence --project-ref ibgsloyjxdopkvwqcqwh`

- **User:** "Push the latest migration"
  → `npx supabase db push --project-ref ibgsloyjxdopkvwqcqwh`, then verify with `list_migrations`

- **User:** "Check what secrets are set"
  → `npx supabase secrets list --project-ref ibgsloyjxdopkvwqcqwh`

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `Error: function not found` | Wrong function name or not created yet | Check `supabase/functions/` directory names |
| Migration fails with constraint error | Conflicting data in remote DB | Review migration SQL, use `IF NOT EXISTS` guards |
| Edge Function returns 500 after deploy | Missing secret | Check `Deno.env.get()` calls; run `secrets list` |
| `npx supabase` not found | CLI not installed | Run `npm install -g supabase` or use `npx supabase@latest` |
| Secrets not available in function | Set on wrong project | Confirm `--project-ref ibgsloyjxdopkvwqcqwh` |
| `db push` shows no changes | Migration already applied | Check `list_migrations`; migration hash already tracked |
