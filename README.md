# Bushel Board

Prairie grain market intelligence dashboard for Canadian farmers (AB, SK, MB).

## What It Does

- Displays weekly CGC (Canadian Grain Commission) grain statistics
- Shows supply/disposition balance for 16 Canadian grain types
- Interactive waterfall charts showing where grain goes (exports, processing, feed)
- Cumulative pace charts comparing producer deliveries vs domestic disappearance
- Storage breakdown by elevator type (primary, process, terminal)
- Personal farm tracking: log your deliveries and track selling pace

## Tech Stack

- **Framework:** Next.js 16 (App Router, Server Components)
- **Database:** Supabase (PostgreSQL + Auth + Edge Functions)
- **UI:** shadcn/ui + Tailwind CSS 4 + Recharts
- **Fonts:** DM Sans (body) + Fraunces (display)
- **Auth:** Supabase Auth (email/password via @supabase/ssr)

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)

### Environment Setup

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

For the intelligence pipeline (Edge Function secrets — set via Supabase Dashboard or CLI).
The pipeline uses xAI's Grok model (`grok-4-1-fast-reasoning`) with X/Twitter search for real-time agriculture sentiment:

```bash
npx supabase secrets set XAI_API_KEY=xai-your-key
```

### Install & Run

```bash
npm install
npx supabase db push          # Apply database migrations
npm run backfill              # Load CGC historical data (~118k rows)
npm run seed-supply           # Seed AAFC supply/disposition data
npm run dev                   # Start dev server at localhost:3000
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run backfill` | Load historical CGC CSV data into Supabase |
| `npm run seed-supply` | Seed AAFC supply/disposition balance sheets |
| `npm run audit-data` | Run CGC data audit (Excel ↔ CSV ↔ Supabase) |
| `npm run test` | Run tests |

## Project Structure

```
app/
  (auth)/           # Login, signup, password reset
  (dashboard)/      # Protected pages
    overview/       # Main dashboard with charts
    grains/         # All grains table
    grain/[slug]/   # Individual grain detail
    my-farm/        # Personal crop & delivery tracking
components/
  dashboard/        # Waterfall, pace chart, storage, summary cards
  layout/           # Nav, logo, theme toggle
  ui/               # shadcn/ui components
data/               # Reference CGC CSV + Excel spreadsheets
lib/
  queries/          # Server-side Supabase query functions
  supabase/         # Auth clients (server, browser, middleware)
  utils/            # Formatting, colors, province helpers
supabase/
  migrations/       # SQL schema migrations
  functions/        # Edge Functions (weekly CGC import)
scripts/            # CLI tools (backfill, seed)
```

## Data Sources

- **CGC Weekly Grain Statistics:** Updated every Thursday ~1pm MST from grainscanada.gc.ca
- **AAFC Crop Outlook:** Annual supply/disposition balance sheets from Agriculture Canada
- **StatsCan:** November crop production estimates (PrincipleFieldCrops)

## Database Tables

| Table | Purpose |
|-------|---------|
| `cgc_observations` | 118k+ rows of weekly grain statistics |
| `grains` | 16 Canadian grain types with slugs |
| `supply_disposition` | AAFC balance sheet data per grain/year |
| `crop_plans` | User-selected crops with delivery logging |
| `profiles` | User profiles (farm name, province) |
| `grain_intelligence` | AI-generated weekly grain narratives and KPIs |
| `farm_summaries` | Per-user weekly AI farm summaries + percentiles |
| `x_market_signals` | X/Twitter posts scored per grain/week |
| `validation_reports` | Post-import anomaly detection results |
| `signal_feedback` | Farmer relevance votes on X signals |
| `cgc_imports` | Audit log of data loads |

## License

Private — not yet licensed for distribution.
