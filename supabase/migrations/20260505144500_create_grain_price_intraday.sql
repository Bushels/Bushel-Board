-- Intraday grain-price snapshots for market-direction reads.
--
-- Daily settlement rows stay in grain_prices. This table stores timestamped
-- quotes from market-data APIs such as Barchart OnDemand so Canola direction
-- can be judged during the trading day without overwriting settlement history.

CREATE TABLE IF NOT EXISTS public.grain_price_intraday (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain text NOT NULL,
  contract text NOT NULL,
  exchange text NOT NULL,
  quote_timestamp timestamptz NOT NULL,
  trade_date date NOT NULL,
  last_price numeric NOT NULL,
  bid numeric,
  ask numeric,
  net_change numeric,
  percent_change numeric,
  open_price numeric,
  high_price numeric,
  low_price numeric,
  previous_close numeric,
  settlement numeric,
  volume integer,
  open_interest numeric,
  mode text,
  flag text,
  currency text NOT NULL,
  unit text NOT NULL,
  source text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grain, contract, quote_timestamp, source)
);

CREATE INDEX IF NOT EXISTS idx_grain_price_intraday_latest
  ON public.grain_price_intraday (grain, contract, quote_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_grain_price_intraday_trade_date
  ON public.grain_price_intraday (trade_date DESC, grain, contract);

ALTER TABLE public.grain_price_intraday ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grain_price_intraday_select_all"
  ON public.grain_price_intraday;
CREATE POLICY "grain_price_intraday_select_all"
  ON public.grain_price_intraday
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "grain_price_intraday_service_role_write"
  ON public.grain_price_intraday;
CREATE POLICY "grain_price_intraday_service_role_write"
  ON public.grain_price_intraday
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.grain_price_intraday TO anon, authenticated;
GRANT ALL ON public.grain_price_intraday TO service_role;

DROP VIEW IF EXISTS public.v_latest_grain_price_intraday;
CREATE VIEW public.v_latest_grain_price_intraday
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (grain, contract)
  grain,
  contract,
  exchange,
  quote_timestamp,
  trade_date,
  last_price,
  bid,
  ask,
  net_change,
  percent_change,
  open_price,
  high_price,
  low_price,
  previous_close,
  settlement,
  volume,
  open_interest,
  mode,
  flag,
  currency,
  unit,
  source,
  imported_at
FROM public.grain_price_intraday
ORDER BY grain, contract, quote_timestamp DESC;

GRANT SELECT ON public.v_latest_grain_price_intraday TO anon, authenticated;

COMMENT ON TABLE public.grain_price_intraday IS
  'Timestamped intraday futures quotes. Use for market-direction and freshness reads; do not treat as final settlement unless flag/source says settled.';

COMMENT ON VIEW public.v_latest_grain_price_intraday IS
  'Latest intraday quote per grain/contract, security-invoker for public read paths.';

NOTIFY pgrst, 'reload schema';
