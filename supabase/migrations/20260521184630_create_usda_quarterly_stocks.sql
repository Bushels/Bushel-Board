-- US Quarterly Grain Stocks (actual measured stocks)
-- Source: USDA NASS Quarterly Grain Stocks / QuickStats STOCKS rows
-- Released: January, March, June, September

create table if not exists public.usda_quarterly_stocks (
    id bigserial primary key,
    report_date date not null,
    quarter text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
    commodity text not null,
    cgc_grain text,
    on_farm_kt numeric,
    off_farm_kt numeric,
    total_stocks_kt numeric not null,
    year_ago_total_kt numeric,
    change_vs_year_ago_pct numeric,
    vs_wasde_estimate_kt numeric,
    source text not null default 'usda_nass_quickstats',
    imported_at timestamptz not null default now(),
    unique (report_date, commodity)
);

comment on table public.usda_quarterly_stocks is
'Actual measured grain stocks from USDA NASS Quarterly Grain Stocks / QuickStats STOCKS rows. Used as a public US thesis source for stocks surprises versus WASDE context.';

comment on column public.usda_quarterly_stocks.total_stocks_kt is
'Total stocks converted to kilotonnes using standard US bushel weights per commodity.';

create index if not exists idx_usda_quarterly_stocks_commodity_date
    on public.usda_quarterly_stocks (commodity, report_date desc);

create index if not exists idx_usda_quarterly_stocks_cgc_grain_date
    on public.usda_quarterly_stocks (cgc_grain, report_date desc)
    where cgc_grain is not null;

alter table public.usda_quarterly_stocks enable row level security;

revoke insert, update, delete, truncate
on public.usda_quarterly_stocks
from anon, authenticated;

grant select
on public.usda_quarterly_stocks
to anon, authenticated;

drop policy if exists "Anon can read USDA quarterly stocks" on public.usda_quarterly_stocks;
create policy "Anon can read USDA quarterly stocks"
    on public.usda_quarterly_stocks
    for select
    to anon
    using (true);

drop policy if exists "Authenticated users can read USDA quarterly stocks" on public.usda_quarterly_stocks;
create policy "Authenticated users can read USDA quarterly stocks"
    on public.usda_quarterly_stocks
    for select
    to authenticated
    using (true);
