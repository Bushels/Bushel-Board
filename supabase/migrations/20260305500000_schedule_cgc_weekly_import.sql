-- Schedule automatic weekly CGC data imports
-- Enables pg_cron + pg_net, stores secrets in Vault, schedules Thursday imports

-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Enable pg_net for async HTTP requests from SQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store project URL and anon key in Vault for secure access
-- (Vault extension is already enabled)
SELECT vault.create_secret(
  'https://ibgsloyjxdopkvwqcqwh.supabase.co',
  'project_url'
);

SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ3Nsb3lqeGRvcGt2d3FjcXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2ODYzMzksImV4cCI6MjA2ODI2MjMzOX0.Ik1980vz4s_UxVuEfBm61-kcIzEH-Nt-hQtydZUeNTw',
  'anon_key'
);

-- Schedule weekly CGC import: Every Thursday at 8pm UTC (1pm MST)
-- The Edge Function auto-detects current crop year and grain week
SELECT cron.schedule(
  'cgc-weekly-import',
  '0 20 * * 4',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/import-cgc-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- To verify: SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';
-- To unschedule: SELECT cron.unschedule('cgc-weekly-import');
