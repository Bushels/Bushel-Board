import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
MODULE_PATH = SCRIPTS_DIR / "import-usda-export-sales.py"
spec = importlib.util.spec_from_file_location("import_usda_export_sales", MODULE_PATH)
assert spec is not None
import_usda_export_sales = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(import_usda_export_sales)


class ImportUsdaExportSalesTests(unittest.TestCase):
    def commodity_codes_by_name(self):
        return {
            row["commodity"]: row["commodity_code"]
            for row in import_usda_export_sales.COMMODITIES
        }

    def test_usda_esr_commodity_codes_match_public_esr_catalog(self):
        self.assertEqual(
            self.commodity_codes_by_name(),
            {
                "ALL WHEAT": 107,
                "CORN": 401,
                "SOYBEANS": 801,
                "SOYBEAN OIL": 902,
                "SOYBEAN MEAL": 901,
                "BARLEY": 301,
                "OATS": 601,
                "SORGHUM": 701,
            },
        )

    def test_projection_admission_works_for_non_wheat_after_code_fix(self):
        record = {
            "commodity_code": 401,
            "commodity": "CORN",
            "market_year": "2025-2026",
            "week_ending": "2026-05-14",
            "total_commitments_mt": 56_000_000,
            "export_pace_pct": None,
            "usda_projection_mt": None,
        }
        wasde_rows = [
            {
                "market_name": "Corn",
                "market_year": "2025",
                "report_month": "2026-05-01",
                "exports_kt": 69_000,
            }
        ]

        applied, warning = import_usda_export_sales.apply_wasde_export_projection(record, wasde_rows)
        detail = import_usda_export_sales.projection_admission_detail(record, wasde_rows)

        self.assertTrue(applied)
        self.assertIsNone(warning)
        self.assertEqual(record["usda_projection_mt"], 69_000_000)
        self.assertEqual(record["export_pace_pct"], 81.159)
        self.assertEqual(detail["status"], "admitted")
        self.assertEqual(detail["wasde_market_year"], "2025")
        self.assertEqual(detail["wasde_report_month"], "2026-05-01")

    def test_projection_admission_detail_explains_guardrail_skip(self):
        record = {
            "commodity_code": 601,
            "commodity": "OATS",
            "market_year": "2025-2026",
            "week_ending": "2026-05-14",
            "total_commitments_mt": 864,
            "export_pace_pct": None,
            "usda_projection_mt": None,
        }
        wasde_rows = [
            {
                "market_name": "Oats",
                "market_year": "2025",
                "report_month": "2026-04-01",
                "exports_kt": 44,
            }
        ]

        applied, warning = import_usda_export_sales.apply_wasde_export_projection(record, wasde_rows)
        detail = import_usda_export_sales.projection_admission_detail(record, wasde_rows)

        self.assertFalse(applied)
        self.assertIn("outside 60-140% guardrail", warning)
        self.assertIsNone(record["export_pace_pct"])
        self.assertEqual(detail["status"], "skipped_guardrail")
        self.assertEqual(detail["commodity_code"], 601)
        self.assertEqual(detail["wasde_market_name"], "Oats")
        self.assertEqual(detail["wasde_market_year"], "2025")
        self.assertEqual(detail["wasde_report_month"], "2026-04-01")
        self.assertEqual(detail["total_commitments_mt"], 864)
        self.assertEqual(detail["usda_projection_mt"], 44_000)
        self.assertEqual(detail["implied_pace_pct"], 1.964)

    def test_projection_admission_summary_keeps_latest_diagnostics(self):
        records = [
            {
                "commodity_code": 301,
                "commodity": "BARLEY",
                "market_year": "2025-2026",
                "week_ending": "2026-05-07",
                "total_commitments_mt": 70_000,
                "export_pace_pct": None,
                "usda_projection_mt": None,
            },
            {
                "commodity_code": 301,
                "commodity": "BARLEY",
                "market_year": "2025-2026",
                "week_ending": "2026-05-14",
                "total_commitments_mt": 74_836,
                "export_pace_pct": None,
                "usda_projection_mt": None,
            },
        ]
        wasde_rows = [
            {
                "market_name": "Barley",
                "market_year": "2025",
                "report_month": "2026-05-01",
                "exports_kt": 196,
            }
        ]

        summary = import_usda_export_sales.enrich_records_with_wasde_projections(records, wasde_rows)

        self.assertEqual(summary["admitted_rows"], 0)
        self.assertEqual(summary["skipped_by_commodity"], {"BARLEY": 2})
        latest = summary["latest_by_commodity"]["BARLEY"]
        self.assertEqual(latest["week_ending"], "2026-05-14")
        self.assertEqual(latest["status"], "skipped_guardrail")
        self.assertEqual(latest["wasde_report_month"], "2026-05-01")
        self.assertEqual(latest["usda_projection_mt"], 196_000)
        self.assertEqual(latest["implied_pace_pct"], 38.182)


if __name__ == "__main__":
    unittest.main()
