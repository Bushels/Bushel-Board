# USDA Export Sales + WASDE projection admission

Last updated: 2026-05-26

Purpose: keep the `/thesis` board from inventing Export Sales pace versus WASDE projection claims in app/UI code. Projection pace is admitted only in `scripts/import-usda-export-sales.py` after commodity, marketing-year, report-month, unit, and sanity-pace checks pass.

## Admission rule

The importer may write `usda_projection_mt` and `export_pace_pct` only when all of these are true:

1. ESR commodity maps to the intended US WASDE market.
2. FAS market-year label such as `2025-2026` maps to WASDE start-year key `2025`.
3. WASDE report month is at or before the ESR `week_ending` date.
4. WASDE `exports_kt` is converted to metric tonnes with `exports_kt * 1000`.
5. `total_commitments_mt / usda_projection_mt * 100` falls inside the 60-140% guardrail.

If any check fails, the row stays null for `usda_projection_mt` and `export_pace_pct`. App code must not recompute these fields from raw packet values.

## 2026-05-26 Barley/Oats audit

A live affected-commodity re-import was run after adding detailed projection diagnostics to `source_runs.metadata.projection_admission.latest_by_commodity`.

Command shape:

```bash
python3 scripts/import-usda-export-sales.py --market-year 2026 --no-next-year --commodity Barley --commodity Oats
npm run refresh-thesis-cache -- --force
```

Live result:

- Source run ID: `7dfecb68-b415-4462-9662-9fb2f6bfce49`
- Rows upserted: 61
- Latest ESR week: 2026-05-14
- Admitted projection rows: 0
- Cache refreshed: 21 rows, source-run watermark `2026-05-26T17:17:12.201648+00:00`

Latest diagnostics:

| Commodity | ESR code | FAS market year | ESR week | Commitments mt | WASDE market year | WASDE report month | WASDE exports kt | Projection mt | Implied pace | Decision |
|---|---:|---|---|---:|---|---|---:|---:|---:|---|
| BARLEY | 301 | 2025-2026 | 2026-05-14 | 74,836 | 2025 | 2026-05-01 | 196 | 196,000 | 38.182% | Keep null; below 60-140% guardrail |
| OATS | 601 | 2025-2026 | 2026-05-14 | 864 | 2025 | 2026-04-01 | 44 | 44,000 | 1.964% | Keep null; below 60-140% guardrail |

Interpretation: this looks like a genuine thin-source / low-US-export-coverage mismatch, not a UI problem and not a commodity-code bug. Barley and Oats should remain null-guarded unless a future source-alignment check proves a safer public projection comparison.

## Current V1 projection status

- Wheat: admitted guarded projection pace.
- Corn: admitted guarded projection pace after ESR code repair.
- Soybeans: admitted guarded projection pace after ESR code repair.
- Barley: null-guarded; latest implied pace 38.182%.
- Oats: null-guarded; latest implied pace 1.964%.

## Verification checklist

After future importer changes:

1. Run focused Python tests:
   `python3 -m unittest tests/scripts/test_import_usda_export_sales.py`
2. Run py_compile:
   `python3 -m py_compile scripts/import-usda-export-sales.py tests/scripts/test_import_usda_export_sales.py`
3. Dry-run affected commodities first and inspect `projection_admission.latest_by_commodity`.
4. Live re-import only affected V1 commodities.
5. Force-refresh thesis cache.
6. Verify cached US packets: Wheat/Corn/Soybeans may show admitted pace; Barley/Oats should stay null unless the importer admits them.
7. Browser-check `/thesis?audit=1` and confirm no Barley/Oats projection-pace claims render while fields are null.
