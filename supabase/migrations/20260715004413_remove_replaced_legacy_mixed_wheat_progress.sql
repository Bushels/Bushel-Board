-- Remove the old synthetic Wheat rows only after every one has at least one
-- explicit winter/spring/durum replacement for the same state and week.

DO $$
DECLARE
  uncovered_count bigint;
BEGIN
  SELECT count(*)
  INTO uncovered_count
  FROM public.usda_crop_progress legacy
  WHERE legacy.commodity = 'WHEAT'
    AND legacy.wheat_class = 'legacy_mixed'
    AND NOT EXISTS (
      SELECT 1
      FROM public.usda_crop_progress explicit
      WHERE explicit.commodity = legacy.commodity
        AND explicit.state = legacy.state
        AND explicit.week_ending = legacy.week_ending
        AND explicit.wheat_class IN ('winter', 'spring', 'durum')
    );

  IF uncovered_count <> 0 THEN
    RAISE EXCEPTION 'Refusing legacy Wheat cleanup: % rows lack class-safe replacements', uncovered_count;
  END IF;
END;
$$;

DELETE FROM public.usda_crop_progress
WHERE commodity = 'WHEAT'
  AND wheat_class = 'legacy_mixed';
