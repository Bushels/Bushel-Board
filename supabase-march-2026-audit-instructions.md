# Supabase March 2026 Update — Audit & Action Checklist

Paste these instructions into your AI coding assistant for any Supabase project to check for impact and leverage new features.

---

## 1. OpenAPI Schema Deprecation (ACTION REQUIRED — Effective March 11, 2026)

**What changed:** The `/rest/v1/` schema endpoint no longer accepts the anon key. Only service role or secret API keys work for schema introspection. Normal data API calls (queries, inserts, updates) are NOT affected.

**Check your project:**

```
Search the entire codebase for these patterns and report what you find:

1. Any HTTP requests to `/rest/v1/` that fetch the OpenAPI schema (not data queries)
   - Look for: `?apiVersion=`, `swagger`, `openapi`, schema introspection URLs

2. Type generation scripts that hit the REST endpoint with anon key:
   - package.json scripts containing `supabase gen types`
   - CI/CD pipelines (GitHub Actions, etc.) running type generation
   - Pre-commit hooks that auto-generate types

3. Any code importing auto-generated type files like `database.types.ts` —
   trace back HOW those types are generated

4. Third-party tools configured with anon key that may do schema introspection:
   - Prisma, Drizzle, or other ORMs pointed at Supabase
   - API documentation generators (Swagger UI, Redoc)
   - Admin panels (Forest Admin, Retool) using anon key

Report:
- FILES affected and LINE NUMBERS
- Whether they use anon key or service role key
- Recommended fix for each (usually: switch to service role key for type generation)
```

**Fix pattern:** If you find type generation using anon key:
```bash
# Before (broken after March 11):
npx supabase gen types typescript --project-id YOUR_PROJECT --schema public > types/database.ts

# After (use service role — this still works but runs locally):
# Ensure SUPABASE_ACCESS_TOKEN is set (personal access token, NOT anon key)
npx supabase gen types typescript --project-id YOUR_PROJECT --schema public > types/database.ts
```

**If using Prisma/Drizzle with direct connection string:** You're fine — these use the Postgres connection, not the REST API.

---

## 2. Log Drains (Now Available on Pro Plans)

**What changed:** Previously Team/Enterprise only. Now Pro plan projects can send Postgres, Auth, Storage, Edge Functions, and Realtime logs to external destinations.

**Supported destinations:** Datadog, Grafana Loki, Sentry, generic HTTP endpoint, S3 (via HTTP endpoint).

**Check if this benefits your project:**

```
Analyze this codebase and answer:

1. Does this project use Supabase Edge Functions? If so, list them.
2. Does this project have any custom logging, error tracking, or monitoring?
3. Are there any manual log-checking patterns (SQL queries against logs,
   dashboard checks, etc.)?
4. Does the project already use an observability tool (Datadog, Sentry,
   Grafana, etc.)?

Based on the answers, recommend whether Log Drains would be valuable and
which destination makes the most sense. Consider:
- Cost: $60/month per drain + $0.20 per million events
- A project with moderate Edge Function usage might generate 100K-500K
  events/month ($0.02-$0.10)
- The main cost is the $60/month drain hour charge
```

**Setup (via Supabase Dashboard):**
1. Go to Project Settings → Log Drains
2. Click "Add Drain"
3. Select destination and configure credentials
4. Select which log sources to include (Postgres, Auth, Edge Functions, etc.)

---

## 3. Storage Performance Overhaul (No Action Required)

**What changed:** Object listing is up to 14.8x faster on large datasets. The `prefixes` table and its 6 triggers have been removed, replaced with a hybrid skip-scan algorithm. Security fixes close a path traversal vulnerability.

**Check your project:**

```
Search the codebase for any of these patterns that might need attention:

1. Any direct SQL queries against the `storage.prefixes` table
   (this table no longer exists)
2. Any custom triggers on storage tables that might conflict
3. Any code that lists storage objects and might benefit from
   the performance improvement
4. Any storage bucket configurations or policies

Report any references to `storage.prefixes` — these will break.
```

---

## 4. Other Notable Changes (Awareness Only)

**Docs export to Markdown:** Every page on docs.supabase.com now has "Copy as Markdown." Useful for feeding Supabase docs directly into AI tools.

**AI Table Filters:** Available under Feature Previews in the Supabase dashboard. Describe what you want to find in natural language and it applies Postgres filters.

**Queue Table Operations:** Stage inserts/edits/deletes in the Table Editor, review in Diff View, commit with Cmd+S. Good for manual data fixes.

**Inline SQL Snippets:** SQL Editor now saves snippets. Share via git in the `supabase/snippets` folder.

**Observability Overview:** New dashboard page rolling out for monitoring project health at a glance.

---

## Quick Audit Summary Template

After running the checks above, fill in:

```
Project: [name]
Supabase Plan: [free/pro/team/enterprise]
Region: [region]

OpenAPI Deprecation:
- Affected: [yes/no]
- Files: [list or "none"]
- Action needed: [describe or "none"]

Log Drains:
- Eligible: [yes/no based on plan]
- Recommended: [yes/no]
- Destination: [datadog/sentry/loki/http/none]
- Estimated monthly cost: [$X]

Storage:
- Uses storage.prefixes: [yes/no]
- Action needed: [describe or "none"]

Notes:
[anything else relevant]
```
