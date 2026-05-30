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
