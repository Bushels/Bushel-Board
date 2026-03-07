-- Fix crop_year format in grain_intelligence: "2025-2026" → "2025-26"
-- The Edge Function was using long format; app convention is short format.
-- Also fix cgc_imports audit rows if any used long format.

UPDATE grain_intelligence
SET crop_year = CONCAT(
  SPLIT_PART(crop_year, '-', 1),
  '-',
  RIGHT(SPLIT_PART(crop_year, '-', 2), 2)
)
WHERE LENGTH(crop_year) > 7;

UPDATE cgc_imports
SET crop_year = CONCAT(
  SPLIT_PART(crop_year, '-', 1),
  '-',
  RIGHT(SPLIT_PART(crop_year, '-', 2), 2)
)
WHERE LENGTH(crop_year) > 7;
