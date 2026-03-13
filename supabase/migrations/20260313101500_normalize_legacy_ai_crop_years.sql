-- Normalize legacy short-format crop years left over from earlier pipeline runs.
-- Example: 2025-26 -> 2025-2026

update grain_intelligence
set crop_year = split_part(crop_year, '-', 1) || '-20' || split_part(crop_year, '-', 2)
where crop_year ~ '^\d{4}-\d{2}$';

update x_market_signals
set crop_year = split_part(crop_year, '-', 1) || '-20' || split_part(crop_year, '-', 2)
where crop_year ~ '^\d{4}-\d{2}$';

update signal_scan_log
set crop_year = split_part(crop_year, '-', 1) || '-20' || split_part(crop_year, '-', 2)
where crop_year ~ '^\d{4}-\d{2}$';
