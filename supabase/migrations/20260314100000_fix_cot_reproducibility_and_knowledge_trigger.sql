-- Fix 1: Add p_max_grain_week to get_cot_positioning() for reproducible reruns.
-- Without this bound, regenerating Week 30 intelligence later pulls Week 32+ COT data.
--
-- Fix 2: Forward-only creation of knowledge_corpus trigger.
-- The original migration (20260312170000) was recorded as applied before the DDL
-- actually ran (phantom migration). Editing it fixed fresh installs but not
-- already-broken environments. This migration is idempotent and repairs both cases.

-- ═══════════════════════════════════════════════════════════════════
-- Fix 1: get_cot_positioning — add p_max_grain_week parameter
-- ═══════════════════════════════════════════════════════════════════
-- Drop old 3-arg signature to avoid overload ambiguity
DROP FUNCTION IF EXISTS get_cot_positioning(text, text, int);

CREATE OR REPLACE FUNCTION get_cot_positioning(
  p_grain text,
  p_crop_year text DEFAULT NULL,
  p_weeks_back int DEFAULT 4,
  p_max_grain_week int DEFAULT NULL
)
RETURNS TABLE (
  report_date date,
  commodity text,
  exchange text,
  mapping_type text,
  open_interest numeric,
  managed_money_net numeric,
  managed_money_net_pct numeric,
  wow_net_change numeric,
  commercial_net numeric,
  commercial_net_pct numeric,
  spec_commercial_divergence boolean,
  grain_week smallint
) LANGUAGE sql STABLE AS $$
  SELECT
    c.report_date,
    c.commodity,
    c.exchange,
    c.mapping_type,
    c.open_interest,
    (c.managed_money_long - c.managed_money_short) AS managed_money_net,
    ROUND(((c.managed_money_long - c.managed_money_short)
      / NULLIF(c.open_interest, 0) * 100)::numeric, 1) AS managed_money_net_pct,
    COALESCE(c.change_managed_money_long, 0)
      - COALESCE(c.change_managed_money_short, 0) AS wow_net_change,
    (c.prod_merc_long - c.prod_merc_short) AS commercial_net,
    ROUND(((c.prod_merc_long - c.prod_merc_short)
      / NULLIF(c.open_interest, 0) * 100)::numeric, 1) AS commercial_net_pct,
    CASE
      WHEN (c.managed_money_long - c.managed_money_short) > 0
        AND (c.prod_merc_long - c.prod_merc_short) < 0 THEN true
      WHEN (c.managed_money_long - c.managed_money_short) < 0
        AND (c.prod_merc_long - c.prod_merc_short) > 0 THEN true
      ELSE false
    END AS spec_commercial_divergence,
    c.grain_week
  FROM cftc_cot_positions c
  WHERE c.cgc_grain = p_grain
    AND (p_crop_year IS NULL OR c.crop_year = p_crop_year)
    AND (p_max_grain_week IS NULL OR c.grain_week <= p_max_grain_week)
    AND c.mapping_type = 'primary'
  ORDER BY c.report_date DESC
  LIMIT p_weeks_back;
$$;

COMMENT ON FUNCTION get_cot_positioning IS 'Returns managed money and commercial net positioning for a CGC grain from CFTC COT data. Pass p_max_grain_week to cap results for reproducible historical reruns.';

-- ═══════════════════════════════════════════════════════════════════
-- Fix 2: knowledge_corpus trigger — idempotent forward-only repair
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.knowledge_chunks_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.heading, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.topic_tags, ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.grain_tags, ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.region_tags, ' ')), 'D');
  RETURN NEW;
END;
$$;

-- DROP + CREATE because CREATE TRIGGER IF NOT EXISTS is not supported in all PG versions
DROP TRIGGER IF EXISTS trg_knowledge_chunks_search_vector ON public.knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_search_vector
  BEFORE INSERT OR UPDATE ON public.knowledge_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.knowledge_chunks_search_vector_trigger();
