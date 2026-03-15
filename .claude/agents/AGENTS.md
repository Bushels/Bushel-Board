# Bushel Board — Agent Knowledge Base

> IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Next.js, Supabase, or Tailwind tasks. When in doubt, check the docs referenced below.

## Project Quick Reference
|key|value|
|---|-----|
|stack|Next.js 16 (App Router) + TypeScript + Supabase + Tailwind CSS 4 + shadcn/ui + Recharts|
|supabase_ref|ibgsloyjxdopkvwqcqwh|
|deploy|Vercel|
|data|CGC weekly grain statistics (122k+ rows, 16 grains, western provinces + national totals)|
|auth|Supabase email/password via @supabase/ssr|

## Supabase Patterns (SSR with Next.js 16)

### Server Component Data Fetching
```typescript
// lib/supabase/server.ts — use this in ALL server components
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies(); // async in Next.js 16!
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } }
  );
}
```

### Browser Client (client components only)
```typescript
// lib/supabase/client.ts — ONLY for "use client" components
import { createBrowserClient } from "@supabase/ssr";
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
```

### Middleware (session refresh)
```typescript
// middleware.ts — refreshes auth session on every request
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Pattern: create client with request cookies, call getUser(), return response with updated cookies
```

### RLS Policy Pattern
```sql
-- Public read: USING (true)
-- Auth write: WITH CHECK (auth.uid() = user_id)
-- Service only: USING (auth.role() = 'service_role')
-- Farmer-only write: WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()))
```

### Edge Function Pattern (Deno)
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async (req) => {
  // Internal-only functions must verify x-bushel-internal-secret
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // ... logic
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
```

## Next.js 16 Patterns

### Server Components (default)
- All page.tsx files are Server Components by default — fetch data directly
- Use `async` components: `export default async function Page() { const data = await fetchData(); }`
- No useEffect, no useState for initial data loading
- Pass data to client components as props

### Client Components (opt-in)
- Add `"use client"` ONLY when needed: event handlers, hooks, browser APIs, Recharts
- Keep client components small — extract interactive parts, keep data fetching in server

### Route Groups
- `(dashboard)` — auth-protected routes with shared layout
- `(auth)` — login/callback routes

### Dynamic Params (Next.js 16)
```typescript
// params is a Promise in Next.js 16!
interface Props { params: Promise<{ slug: string }> }
export default async function Page({ params }: Props) {
  const { slug } = await params;
}
```

### Middleware Matcher
```typescript
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

## Tailwind Design Tokens
|token|light|dark|usage|
|-----|-----|----|-----|
|wheat-50|#f5f3ee|—|page background|
|wheat-900|#2a261e|bg|dark mode background|
|canola|#c17f24|#d4983e|primary actions, links|
|prairie|#437a22|#5a9e30|success, positive values|
|error|#b33a3a|#c44|negative values|
|province-ab|#2e6b9e|—|Alberta|
|province-sk|#6d9e3a|—|Saskatchewan|
|province-bc|#2f8f83|—|British Columbia|
|province-mb|#b37d24|—|Manitoba|

## CGC Data Schema
```
cgc_observations: id | crop_year | grain_week | week_ending_date | worksheet | metric | period | grain | grade | region | ktonnes
UNIQUE(crop_year, grain_week, worksheet, metric, period, grain, grade, region)
```
Key worksheets: Primary, Summary, Terminal Exports, Terminal Stocks, *Shipment Distribution
Key metrics: Deliveries, Shipments, Stocks, Receipts, Exports
Periods: "Crop Year" (cumulative), "Current Week"
Regions: Alberta, British Columbia, Saskatchewan, Manitoba, Vancouver, Thunder Bay, Prince Rupert, Churchill, +more

## Script Conventions
All scripts in `scripts/` must:
- Accept `--help` flag with usage info
- Output structured JSON to stdout
- Send diagnostics to stderr
- Be idempotent (safe to re-run)
- Use `--dry-run` for destructive operations
- Pin dependency versions
