import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
MODULE_PATH = SCRIPTS_DIR / "import-aafc-canola-outlook.py"
spec = importlib.util.spec_from_file_location(
    "import_aafc_canola_outlook",
    MODULE_PATH,
)
assert spec is not None
collector = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(collector)


def report_html(*, omit: str | None = None) -> str:
    metrics = [
        ("Area seeded (thousand hectares)", "8,908", "8,751", "9,487"),
        ("Area harvested (thousand hectares)", "8,846", "8,699", "9,378"),
        ("Yield (tonnes per hectare)", "2.17", "2.51", "2.24"),
        ("Production (thousand tonnes)", "19,239", "21,809", "21,000"),
        ("Imports (thousand tonnes)", "131", "120", "100"),
        ("Total supply (thousand tonnes)", "22,595", "23,526", "23,825"),
        ("Exports (thousand tonnes)", "9,379", "8,500", "8,000"),
        (
            "Food and Industrial Use (thousand tonnes)",
            "11,412",
            "12,100",
            "13,500",
        ),
        ("Feed, Waste & Dockage (thousand tonnes)", "143", "150", "200"),
        ("Total Domestic Use (thousand tonnes)", "11,619", "12,301", "13,751"),
        ("Carry-out Stocks (thousand tonnes)", "1,597", "2,725", "2,074"),
        ("Average Price ($/tonne)", "677", "700", "710"),
    ]
    body = "".join(
        f"<tr><th>{label}</th><td>{a}</td><td>{b}</td><td>{c}</td></tr>"
        for label, a, b, c in metrics
        if collector._metric_key(label) != omit
    )
    return (
        "<html><body><h3>Canola</h3><p>Context</p><table>"
        "<thead><tr><td></td><th>2024-2025</th>"
        "<th>2025-2026<span class='wb-inv'>Canola note f</span></th>"
        "<th>2026-2027</th></tr></thead>"
        f"<tbody>{body}</tbody></table></body></html>"
    )


class ImportAafcCanolaOutlookTests(unittest.TestCase):
    def test_discovers_latest_official_report_link(self):
        page = """
        <a href="/en/sector/crops/reports-statistics/canada-outlook-principal-field-crops-2026-06-19">June</a>
        <a href="/en/sector/crops/reports-statistics/canada-outlook-principal-field-crops-2026-07-20">July</a>
        """
        self.assertEqual(
            collector.discover_latest_report_url(page),
            "https://agriculture.canada.ca/en/sector/crops/reports-statistics/"
            "canada-outlook-principal-field-crops-2026-07-20",
        )

    def test_parses_and_reconciles_all_three_crop_years(self):
        url = (
            "https://agriculture.canada.ca/en/sector/crops/reports-statistics/"
            "canada-outlook-principal-field-crops-2026-07-20"
        )
        rows = collector.parse_canola_rows(report_html(), url)

        self.assertEqual(
            [row["crop_year"] for row in rows],
            ["2024-2025", "2025-2026", "2026-2027"],
        )
        current = rows[1]
        forecast = rows[2]
        self.assertEqual(current["production_kt"], 21809)
        self.assertEqual(current["food_industrial_kt"], 12100)
        self.assertEqual(current["carry_out_kt"], 2725)
        self.assertEqual(forecast["seeded_area_acres"], 23442888)
        self.assertEqual(forecast["total_supply_kt"], 23825)
        self.assertEqual(forecast["source"], "AAFC_2026-07-20")
        self.assertAlmostEqual(forecast["yield_bu_per_acre"], 39.97, places=2)

    def test_fails_closed_when_a_required_metric_is_missing(self):
        url = (
            "https://agriculture.canada.ca/en/sector/crops/reports-statistics/"
            "canada-outlook-principal-field-crops-2026-07-20"
        )
        with self.assertRaisesRegex(collector.ImporterError, "missing required"):
            collector.parse_canola_rows(report_html(omit="carry_out"), url)

    def test_fails_closed_when_balance_does_not_reconcile(self):
        broken = report_html().replace(
            "<th>Total Domestic Use (thousand tonnes)</th>"
            "<td>11,619</td><td>12,301</td><td>13,751</td>",
            "<th>Total Domestic Use (thousand tonnes)</th>"
            "<td>11,619</td><td>12,301</td><td>12,751</td>",
        )
        url = (
            "https://agriculture.canada.ca/en/sector/crops/reports-statistics/"
            "canada-outlook-principal-field-crops-2026-07-20"
        )
        with self.assertRaisesRegex(collector.ImporterError, "does not reconcile"):
            collector.parse_canola_rows(broken, url)


if __name__ == "__main__":
    unittest.main()
