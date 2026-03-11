-- Lightweight scan log for observability: tracks every pulse/deep scan run
-- with grain scope, signal count, and duration for monitoring.

CREATE TABLE IF NOT EXISTS public.signal_scan_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  scan_mode text NOT NULL CHECK (scan_mode IN ('pulse', 'deep')),
  grains_scanned text[] NOT NULL,
  signals_found int NOT NULL DEFAULT 0,
  duration_ms int,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_scan_log_time ON public.signal_scan_log(started_at DESC);

ALTER TABLE public.signal_scan_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scan_log"
  ON public.signal_scan_log FOR SELECT
  USING (true);

CREATE POLICY "Service role manages scan_log"
  ON public.signal_scan_log FOR ALL
  USING (auth.role() = 'service_role');
