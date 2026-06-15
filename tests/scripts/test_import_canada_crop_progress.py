import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

spec = importlib.util.spec_from_file_location(
    "import_canada_crop_progress",
    SCRIPTS_DIR / "import-canada-crop-progress.py",
)
assert spec is not None
assert spec.loader is not None
canada = importlib.util.module_from_spec(spec)
spec.loader.exec_module(canada)


class CanadaCropProgressImporterTests(unittest.TestCase):
    def test_prairie_week_status_tracks_province_sequence(self):
        self.assertEqual(canada.prairie_week_status(["MB"]), "partial_mb_only")
        self.assertEqual(canada.prairie_week_status(["MB", "SK"]), "partial_mb_sk")
        self.assertEqual(canada.prairie_week_status(["MB", "SK", "AB"]), "complete_mb_sk_ab")
        self.assertEqual(
            canada.prairie_week_status(["MB", "SK"], missing_provinces=["AB"]),
            "complete_with_missing_province",
        )
        self.assertEqual(canada.prairie_week_status(["SK"]), "partial_prairie_week")

    def test_prairie_week_status_rejects_collected_missing_overlap(self):
        with self.assertRaisesRegex(ValueError, "missing_province cannot also be collected: AB"):
            canada.prairie_week_status(["MB", "SK", "AB"], missing_provinces=["AB"])

    def test_manitoba_discovery_selects_latest_pdf_from_index(self):
        html = b'''
        <a href="pubs/crop-report-2026-05-05.pdf">May 5</a>
        <a href="pubs/crop-report-2026-05-20.pdf">May 20</a>
        <a href="pubs/crop-report-2026-05-12.pdf">May 12</a>
        '''
        with patch.object(canada, "fetch_bytes", return_value=(html, canada.MANITOBA_PAGE_URL)):
            info = canada.latest_manitoba_report_info()

        self.assertEqual(info["discovery_status"], "discovered_latest_pdf_link")
        self.assertEqual(info["report_date"], "2026-05-20")
        self.assertTrue(info["report_url"].endswith("crop-report-2026-05-20.pdf"))
        self.assertEqual(info["candidate_count"], 3)

    def test_saskatchewan_discovery_keeps_report_and_table_links_separate(self):
        html = b'''
        <a href="/api/v1/products/128638/formats/new-report/download">Download Crop Report</a>
        <a href="/api/v1/products/128627/formats/new-table/download">Seeding Progress Table</a>
        '''
        with patch.object(canada, "fetch_bytes", return_value=(html, canada.SASKATCHEWAN_PAGE_URL)):
            info = canada.latest_saskatchewan_links_info()

        self.assertEqual(info["discovery_status"], "discovered_page_links")
        self.assertIn("new-report", info["report_url"])
        self.assertIn("new-table", info["table_url"])
        self.assertEqual(info["discovered_labels"], ["download crop report", "seeding progress table"])

    def test_saskatchewan_parser_uses_current_report_wording_and_dynamic_period_excerpts(self):
        table_text = """
        Provincial        South East        South West        East Central        West Central        North East        North West
        Spring Wheat      65%               69%               30%                 68%                 29%               79%               52%
        """
        report_text = """
        For the Period May 19 to May 25, 2026
        Report number 4, May 28, 2026
        Seeding progress reached 52 per cent across Saskatchewan, behind the five-year average of 74 per cent.
        One year ago seeding now 88 per cent complete.
        Cropland topsoil moisture is:
        • 19 per cent surplus;
        • 70 per cent adequate; and
        • 11 per cent short.
        Hayland topsoil moisture is:
        • 14 per cent surplus;
        • 70 per cent adequate; and
        • 16 per cent short.
        Pasture topsoil moisture is:
        • 9 per cent surplus;
        • 68 per cent adequate;
        • 20 per cent short; and
        • 3 per cent very short.
        Crop development varies due to localized weather, leading to differences in temperature and moisture.
        Currently, fall cereals are at 58 per cent of normal development, with one per cent ahead and 41 per cent
        behind in development. Spring cereals are 37 per cent normal, 63 per cent behind. Pulse crops are 45 per cent
        normal and 55 per cent behind. Oilseeds are at 27 per cent of their normal stage of development and 73 per
        cent behind. Perennial forage is 50 per cent at normal development, with two per cent ahead and 48 per cent
        behind. Annual forage is at 39 per cent normal development, with two per cent ahead and 59 per cent behind.
        For further information, contact Saskatchewan Agriculture.
        """

        def fake_pdf_to_text(url, *, layout):
            if url == "https://example.test/table.pdf":
                return table_text, url
            return report_text, url

        with (
            patch.object(
                canada,
                "latest_saskatchewan_links",
                return_value=("https://example.test/report.pdf", "https://example.test/table.pdf"),
            ),
            patch.object(canada, "pdf_to_text", side_effect=fake_pdf_to_text),
        ):
            rows, document_url = canada.parse_saskatchewan()

        self.assertEqual(document_url, "https://example.test/table.pdf")
        all_crops = next(row for row in rows if row["crop_name"] == "All Crops")
        self.assertEqual(all_crops["value_pct"], 52.0)
        self.assertEqual(all_crops["five_year_avg_pct"], 74.0)
        self.assertEqual(all_crops["previous_year_pct"], 88.0)
        self.assertIn("period ending 2026-05-25", all_crops["source_excerpt"])
        regional = next(row for row in rows if row["crop_name"] == "Spring Wheat")
        self.assertEqual(regional["period_start"], "2026-05-19")
        self.assertEqual(regional["period_end"], "2026-05-25")
        self.assertIn("2026-05-19 to 2026-05-25", regional["source_excerpt"])

        moisture_rows = [row for row in rows if row["metric"] == "soil_moisture_adequate_surplus_pct"]
        self.assertEqual(len(moisture_rows), 3)
        moisture_by_crop = {row["crop_name"]: row for row in moisture_rows}
        self.assertEqual(moisture_by_crop["Cropland"]["value_pct"], 89.0)
        self.assertEqual(moisture_by_crop["Hayland"]["value_pct"], 84.0)
        self.assertEqual(moisture_by_crop["Pasture"]["value_pct"], 77.0)
        self.assertTrue(all(row["canonical_grain"] is None for row in moisture_rows))
        self.assertTrue(all(row["document_url"] == "https://example.test/report.pdf" for row in moisture_rows))

        development_rows = [row for row in rows if row["metric"].startswith("development_")]
        self.assertEqual(len(development_rows), 15)
        development_by_crop_metric = {
            (row["crop_name"], row["metric"]): row["value_pct"] for row in development_rows
        }
        self.assertEqual(development_by_crop_metric[("Fall Cereals", "development_normal_pct")], 58.0)
        self.assertEqual(development_by_crop_metric[("Fall Cereals", "development_ahead_pct")], 1.0)
        self.assertEqual(development_by_crop_metric[("Fall Cereals", "development_behind_pct")], 41.0)
        self.assertEqual(development_by_crop_metric[("Spring Cereals", "development_normal_pct")], 37.0)
        self.assertEqual(development_by_crop_metric[("Spring Cereals", "development_behind_pct")], 63.0)
        self.assertNotIn(("Spring Cereals", "development_ahead_pct"), development_by_crop_metric)
        self.assertEqual(development_by_crop_metric[("Pulse Crops", "development_normal_pct")], 45.0)
        self.assertEqual(development_by_crop_metric[("Oilseeds", "development_behind_pct")], 73.0)
        self.assertEqual(development_by_crop_metric[("Perennial Forage", "development_ahead_pct")], 2.0)
        self.assertEqual(development_by_crop_metric[("Annual Forage", "development_behind_pct")], 59.0)
        self.assertTrue(all(row["canonical_grain"] is None for row in development_rows))
        self.assertTrue(all(row["document_url"] == "https://example.test/report.pdf" for row in development_rows))

    def test_alberta_discovery_records_resource_metadata(self):
        payload = {
            "result": {
                "date_modified": "2026-05-22T19:31:00",
                "resources": [
                    {
                        "id": "calendar",
                        "name": "Crop reporting calendar release dates 2026",
                        "format": "PDF",
                        "url": "https://example.test/calendar.pdf",
                    },
                    {
                        "id": "old",
                        "name": "Alberta Crop Report, May 8, 2026",
                        "format": "PDF",
                        "url": "https://example.test/old.pdf",
                        "created": "2026-05-08T19:30:00",
                        "last_modified": "2026-05-08T19:31:00",
                    },
                    {
                        "id": "new",
                        "name": "Alberta Crop Report, May 22, 2026",
                        "format": "PDF",
                        "url": "https://example.test/new.pdf",
                        "created": "2026-05-22T19:30:00",
                        "last_modified": "2026-05-22T19:31:00",
                    },
                ],
            }
        }
        with patch.object(canada, "fetch_json", return_value=payload):
            info = canada.latest_alberta_report_info()

        self.assertEqual(info["discovery_status"], "discovered_latest_resource")
        self.assertEqual(info["report_url"], "https://example.test/new.pdf")
        self.assertEqual(info["report_date"], "2026-05-22")
        self.assertEqual(info["resource_id"], "new")
        self.assertEqual(info["candidate_count"], 2)
        self.assertEqual(info["package_date_modified"], "2026-05-22T19:31:00")

    def test_alberta_parser_skips_historical_date_rows_in_current_table(self):
        pdf_text = """
        Crop conditions as of May 26, 2026
        ©2026 Government of Alberta | May 29, 2026
        Provincial emergence of major crops (5-year average) is reported at 33 per cent, below the 5-year average of 43 per cent.
        Crop emergence in the South Region is ahead of the 5-year average at 66 (52) per cent. In other regions, emergence is
        behind their respective 5-year averages with Central at 36 (47) per cent, North East at 23 (39) per cent, North West at 16 (29)
        per cent and Peace at 9 (39) per cent.
        Table 1: Alberta Major Crop Seeding Progress
        Spring Wheat, May 19     11%     12%     13%     14%     15%     16%
        Spring Wheat, May 26     97.1%   95.4%   87.4%   71.8%   62.0%   86.2%
        5-year All Crops         93%     91%     82%     70%     61%     84%
        Source: AGI/AFSC Crop Reporting Survey
        Table 2: Alberta Surface Soil (0-6 in) Moisture Ratings as of May 26, 2026
                              Poor     Fair     Good     Excellent     Excessive
        South                14.0%    30.9%    54.3%       0.7%          0.0%
        Central              31.4%    23.3%    43.2%       2.1%          0.0%
        North East            9.8%    14.6%    52.4%      19.5%          3.8%
        North West           17.1%    15.2%    27.6%      29.5%         10.6%
        Peace                 0.0%     5.9%    50.4%      39.4%          4.3%
        Alberta              17.0%    21.3%    47.4%      12.0%          2.3%
        5-year (2021-2025) Avg 8.6%   28.3%    50.1%      12.5%          0.6%
        Source: AGI/AFSC Crop Reporting Survey
        Table 3: Pasture Growth Conditions as of May 26, 2026
                              Poor     Fair     Good     Excellent
        South                 9.6%    37.0%    52.8%       0.6%
        Central              15.3%    31.5%    51.3%       1.8%
        North East            9.2%    48.0%    41.7%       1.2%
        North West            9.8%    48.4%    40.9%       0.9%
        Peace                35.1%    37.3%    23.5%       4.1%
        Alberta              13.2%    38.0%    47.4%       1.4%
        5-year (2021-2025) Avg 12.0%  33.5%    50.8%       3.7%
        Source: AGI/AFSC Crop Reporting Survey
        """

        with patch.object(canada, "pdf_to_text", return_value=(pdf_text, "https://example.test/ab.pdf")):
            rows, document_url = canada.parse_alberta("https://example.test/ab.pdf")

        self.assertEqual(document_url, "https://example.test/ab.pdf")
        spring_wheat_rows = [row for row in rows if row["crop_name"] == "Spring Wheat"]
        self.assertEqual(len(spring_wheat_rows), 6)
        self.assertEqual(spring_wheat_rows[0]["value_pct"], 97.1)
        self.assertTrue(all(row["report_date"] == "2026-05-26" for row in spring_wheat_rows))
        emergence_rows = [row for row in rows if row["metric"] == "emerged_pct"]
        self.assertEqual(len(emergence_rows), 6)
        provincial_emergence = next(row for row in emergence_rows if row["region_code"] == "PROV")
        self.assertEqual(provincial_emergence["value_pct"], 33.0)
        self.assertEqual(provincial_emergence["five_year_avg_pct"], 43.0)

        soil_rows = [row for row in rows if row["metric"] == "soil_moisture_adequate_surplus_pct"]
        self.assertEqual(len(soil_rows), 6)
        provincial_soil = next(row for row in soil_rows if row["region_code"] == "PROV")
        self.assertAlmostEqual(provincial_soil["value_pct"], 61.7)
        self.assertAlmostEqual(provincial_soil["five_year_avg_pct"], 63.2)

        pasture_rows = [row for row in rows if row["metric"] == "pasture_good_excellent_pct"]
        self.assertEqual(len(pasture_rows), 6)
        provincial_pasture = next(row for row in pasture_rows if row["region_code"] == "PROV")
        self.assertAlmostEqual(provincial_pasture["value_pct"], 48.8)
        self.assertAlmostEqual(provincial_pasture["five_year_avg_pct"], 54.5)

    def test_alberta_parser_uses_narrative_seeding_when_abbreviated_report_drops_seeding_table(self):
        pdf_text = """
        Alberta Crop Report
        Crop conditions as of June 9, 2026
        (Abbreviated Report)
        Provincial seeding progress of major crops has reached 97 per cent, nearing the 5-year average of 100
        per cent. Seeding progress for major crops by region (5-year avg) is reported at 100 (100) per cent in the South Region, 100
        (100) per cent in the Central Region, 93 (100) per cent in the North East Region, 95 (100) per cent in the North West Region
        and 97 (99) per cent in the Peace Region.
        Provincial emergence of major crops is reported at 80 per cent, below the 5-year average of 88 per cent.
        Table 1: Alberta Emergence of Major Crops as of June 9, 2026
        Source: AGI/AFSC Crop Reporting Survey
        (c)2026 Government of Alberta | June 12, 2026 | Agriculture and Irrigation
        Table 2: Alberta Surface Soil Moisture Ratings as of June 9, 2026
                              Poor     Fair     Good     Excellent     Excessive
        South                 0.7%    11.6%    58.6%      28.1%          1.0%
        Central               0.0%     3.9%    65.4%      25.6%          5.0%
        North East            0.0%     8.8%    34.2%      40.7%         16.2%
        North West            0.0%     1.3%    32.9%      46.5%         19.4%
        Peace                 0.0%     9.3%    57.1%      32.0%          1.6%
        Alberta               0.2%     7.5%    53.1%      32.2%          7.0%
        Source: AGI/AFSC Crop Reporting Survey
        """

        with patch.object(canada, "pdf_to_text", return_value=(pdf_text, "https://example.test/ab-brief.pdf")):
            rows, document_url = canada.parse_alberta("https://example.test/ab-brief.pdf")

        self.assertEqual(document_url, "https://example.test/ab-brief.pdf")
        seeded_rows = [row for row in rows if row["metric"] == "seeded_pct"]
        self.assertEqual(len(seeded_rows), 6)
        seeded_by_region = {row["region_code"]: row for row in seeded_rows}
        self.assertEqual(seeded_by_region["PROV"]["value_pct"], 97.0)
        self.assertEqual(seeded_by_region["PROV"]["five_year_avg_pct"], 100.0)
        self.assertEqual(seeded_by_region["SOUTH"]["value_pct"], 100.0)
        self.assertEqual(seeded_by_region["CENTRAL"]["five_year_avg_pct"], 100.0)
        self.assertEqual(seeded_by_region["NE"]["value_pct"], 93.0)
        self.assertEqual(seeded_by_region["NW"]["value_pct"], 95.0)
        self.assertEqual(seeded_by_region["PEACE"]["five_year_avg_pct"], 99.0)
        self.assertTrue(all(row["crop_name"] == "All Crops" for row in seeded_rows))
        self.assertEqual(seeded_by_region["PROV"]["region_scope"], "province")
        self.assertEqual(seeded_by_region["SOUTH"]["region_scope"], "crop_region")
        self.assertTrue(all(row["report_date"] == "2026-06-09" for row in seeded_rows))

        emergence_rows = [row for row in rows if row["metric"] == "emerged_pct"]
        self.assertEqual(len(emergence_rows), 1)
        self.assertEqual(emergence_rows[0]["value_pct"], 80.0)
        self.assertEqual(emergence_rows[0]["five_year_avg_pct"], 88.0)

        soil_rows = [row for row in rows if row["metric"] == "soil_moisture_adequate_surplus_pct"]
        self.assertEqual(len(soil_rows), 6)
        provincial_soil = next(row for row in soil_rows if row["region_code"] == "PROV")
        self.assertAlmostEqual(provincial_soil["value_pct"], 92.3)

    def test_collect_records_discovery_evidence_per_province(self):
        fake_row = {
            "report_date": "2026-05-20",
            "report_label": "Crop Report - 2026-05-20",
        }
        with (
            patch.object(canada, "source_discovery_for_province", return_value={"discovery_status": "stubbed"}),
            patch.object(canada, "parse_manitoba", return_value=([fake_row], "https://example.test/mb.pdf")),
        ):
            rows, summaries = canada.collect(["MB"])

        self.assertEqual(rows, [fake_row])
        self.assertEqual(summaries[0]["province"], "MB")
        self.assertEqual(summaries[0]["source_url"], "https://example.test/mb.pdf")
        self.assertEqual(summaries[0]["discovery"], {"discovery_status": "stubbed"})


if __name__ == "__main__":
    unittest.main()
