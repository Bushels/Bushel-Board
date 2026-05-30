# Canada Crop Progress Release Schedule

Last verified: 2026-05-26

Purpose: keep the Canada seeding/crop-progress collector honest. Do not schedule this source as a single guessed weekly release. Manitoba, Saskatchewan, and Alberta publish on different days, and Alberta is the last Prairie province in the normal weekly sequence.

## Operating schedule for Bushel Board

All times are America/Edmonton / Mountain Time unless noted.

| Province | Official source | 2026 observed / stated cadence | Recommended collector slot | Evidence to record in `source_runs` | Notes |
| --- | --- | --- | --- | --- | --- |
| Manitoba | Manitoba Agriculture Crop Report page | Report PDFs are dated Tuesday in normal weeks; observed 2026: May 5 Tuesday, May 12 Tuesday, May 20 Wednesday after the Victoria Day holiday week. | Tuesday 12:45 PM MT, plus Wednesday 10:30 AM MT retry during holiday/late weeks. | PDF URL, PDF creation/modification timestamp, report date from title. | Manitoba does not expose a clean API in the current importer; scrape the index page for the newest `crop-report-YYYY-MM-DD.pdf` instead of hardcoding a PDF URL. |
| Saskatchewan | Saskatchewan Crop Report page and Publications Saskatchewan product/API formats | Weekly report period runs Tuesday-to-Monday, then public report/table formats publish Thursday. Observed 2026 format publication dates: Apr 28-May 4 -> Thu May 7; May 5-May 11 -> Thu May 14; May 12-May 18 report PDF says Report number 03, May 21, 2026. | Thursday 11:15 AM MT, with Friday 9:15 AM MT retry if the newest format still has no publication date/new download. | Product format description, format publication date when available, PDF report number/date, table format id. | Prefer Saskatchewan's JSON seeding-progress table format over PDF text where possible. The live page may list the newest report before every format metadata field is populated, so the importer should tolerate null `formatPublicationDate` if the PDF/table content date advanced. |
| Alberta | Alberta Crop Reports page + Open Alberta package `2830245` / dataset `9af5b54d-f334-46ca-a0b1-23e560edb353` | Official 2026 calendar: survey date is Tuesday; crop report public release is Friday by approximately 1:30 PM. Examples: May 5 survey -> Fri May 8 release; May 12 abbreviated -> Fri May 15; May 19 -> Fri May 22. | Friday 1:45 PM MT, with Friday 3:30 PM MT retry if Open Alberta metadata has not advanced. | Open Alberta resource URL, resource `created`/`last_modified`, report condition date, package `date_modified`. | Alberta is intentionally last in the weekly Prairie sequence. Some reports are labelled `abbreviated`; still import them, but mark `report_variant=abbreviated` in metadata when parsed. |

## Weekly sequence

```text
TUE midday      Manitoba normal-week report check
WED morning     Manitoba holiday/late-week retry
THU late AM     Saskatchewan report/table check
FRI 1:45 PM     Alberta report check after official 1:30 PM release target
FRI 3:30 PM     Alberta retry / final Prairie crop-progress checkpoint
```

For thesis automation, the Friday Alberta checkpoint is the first safe time to say the full Prairie crop-progress week is complete. Earlier Manitoba/Saskatchewan imports can write source rows and soft evidence, but the Canada seeding-progress package should remain `partial_prairie_week` until Alberta lands or is explicitly stale/missing.

## Source URLs verified

- Manitoba Crop Report index: https://www.gov.mb.ca/agriculture/crops/seasonal-reports/crop-report/index.html
- Manitoba 2026 examples:
  - https://www.gov.mb.ca/agriculture/crops/seasonal-reports/crop-report/pubs/crop-report-2026-05-05.pdf
  - https://www.gov.mb.ca/agriculture/crops/seasonal-reports/crop-report/pubs/crop-report-2026-05-12.pdf
  - https://www.gov.mb.ca/agriculture/crops/seasonal-reports/crop-report/pubs/crop-report-2026-05-20.pdf
- Saskatchewan Crop Report page: https://www.saskatchewan.ca/business/agriculture-natural-resources-and-industry/agribusiness-farmers-and-ranchers/market-and-trade-statistics/crops-statistics/crop-report
- Saskatchewan 2026 product APIs:
  - Crop report product `128638`: https://publications.saskatchewan.ca/api/v1/products/128638
  - Seeding progress table product `128627`: https://publications.saskatchewan.ca/api/v1/products/128627
  - Seeding progress table download format appears on the live page under `Seeding Progress Table`.
- Alberta Crop Reports page: https://www.alberta.ca/alberta-crop-reports
- Alberta Open Data package API: https://open.alberta.ca/api/3/action/package_show?id=9af5b54d-f334-46ca-a0b1-23e560edb353
- Alberta 2026 crop reporting calendar PDF: https://open.alberta.ca/dataset/9af5b54d-f334-46ca-a0b1-23e560edb353/resource/237633c6-ec5f-4735-a1ff-1e883737055b/download/agi-itrb-alberta-crop-reporting-calendar-release-dates-2026.pdf

## Collector implications

1. Do not run one Canada crop-progress collector before Alberta and call the week complete.
2. Split the mechanical schedule into province-aware checks, or run one idempotent collector multiple times across the week with `--province MB`, `--province SK`, and `--province AB`.
3. The importer should discover current URLs/format ids from the source pages/APIs. Hardcoded 2026-05-05 PDF constants are seed fixtures only and should not be treated as the live schedule.
4. `source_runs.metadata` should include `prairie_week_status`:
   - `partial_mb_only`
   - `partial_mb_sk`
   - `complete_mb_sk_ab`
   - `complete_with_missing_province` only when a province is past its retry window and explicitly logged as stale/missing.
5. `/thesis` and the Friday roundtable should only treat Canada crop progress as a complete weekly package after the Alberta Friday release/retry window.
6. Preserve the V1 no-proxy wheat rule: Spring Wheat and Winter Wheat remain `Mapping needed` until class-specific mapping is deliberately admitted; do not fill them from generic Wheat or from broad provincial progress copy.
