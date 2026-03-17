---
name: pre-commit-validator
description: 7-point pre-commit validation checklist for database migrations, RPC functions, and Edge Functions. Run before considering any database work done.
---

# Pre-Commit Validator — Database & Pipeline

## When To Trigger

Run these checks BEFORE considering any database/RPC/Edge Function/migration work done. This is part of Gate 3 (Verify).

## The 7 Mandatory Checks

### 1. Convention Grep
If you changed a pattern (function signature, format string, column name), grep the ENTIRE codebase for all instances.

**Why:** `getCurrentCropYear` existed in 6 files — changing one is not a fix. Convention changes must be global.

```bash
grep -rn "old_pattern" --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.md"
```

### 2. Cross-Table Join Test
If you created/modified an RPC or view, verify that join columns use the same format across tables.

```sql
SELECT DISTINCT crop_year FROM table_a
UNION ALL
SELECT DISTINCT crop_year FROM table_b;
-- Both sides must use same format
```

### 3. Edge Function Parity
If you fixed a utility function in one Edge Function, check ALL Edge Functions for the same pattern. They share no code — each has its own copy.

```bash
grep -rn "pattern" supabase/functions/*/
```

### 4. Local Migration Files
Supabase MCP `apply_migration` does NOT create local `.sql` files. Always write the migration to `supabase/migrations/` manually.

**Check:** `ls supabase/migrations/ | tail -5` — your new migration should be there.

### 5. RPC Return Shape
If an RPC `RETURNS jsonb`, verify it actually returns a scalar jsonb, not multiple rows. `GROUP BY` in a `RETURNS jsonb` function = runtime error.

### 6. GRANT Verification (CRITICAL)
Every `CREATE FUNCTION` in a migration MUST have a matching `GRANT EXECUTE ON FUNCTION ... TO authenticated;`.

**Validation command:**
```bash
grep -c 'CREATE.*FUNCTION' supabase/migrations/new_migration.sql
grep -c 'GRANT EXECUTE' supabase/migrations/new_migration.sql
# These numbers MUST match
```

All 13+ existing migrations follow this convention.

### 7. PostgREST Row-Count Audit
If your query targets a high-cardinality worksheet:
- Terminal Receipts: ~3,648 rows/grain
- Terminal Exports: ~1,050 rows/grain

NEVER use raw PostgREST `.select()`. Use an RPC with `SUM() GROUP BY`.

**Truncation signal:** Any query returning exactly 1000 rows.

## Operational Checklist (Post-Validation)

After all 7 checks pass:
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npx supabase db push --linked`
- [ ] Deploy changed Edge Functions: `npx supabase functions deploy <name>`
- [ ] Confirm Vercel and Supabase share the same internal function secret
- [ ] Confirm legacy `pg_cron` job does not exist
- [ ] Verify data joins return expected row counts
