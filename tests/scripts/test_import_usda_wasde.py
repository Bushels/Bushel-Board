import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
MODULE_PATH = SCRIPTS_DIR / "import-usda-wasde.py"
spec = importlib.util.spec_from_file_location("import_usda_wasde", MODULE_PATH)
assert spec is not None
import_usda_wasde = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(import_usda_wasde)


class ImportUsdaWasdeMarketTests(unittest.TestCase):
    @staticmethod
    def snapshot_rows(
        market_name,
        attribute_ids,
        *,
        market_year="2026",
        calendar_year=2026,
        month=7,
    ):
        return [
            {
                "market_name": market_name,
                "market_year": market_year,
                "calendar_year": calendar_year,
                "month": month,
                "attribute_id": attribute_id,
                "unit_id": 8,
                "value": 1,
            }
            for attribute_id in attribute_ids
        ]

    def test_requested_market_coverage_fails_closed_before_writes(self):
        markets = [
            {"market_name": "US Rapeseed"},
            {"market_name": "US Rapeseed Oil"},
        ]
        rapeseed_rows = self.snapshot_rows(
            "US Rapeseed",
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed"],
        )
        oil_rows = self.snapshot_rows(
            "US Rapeseed Oil",
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed Oil"],
        )

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "US Rapeseed Oil",
        ):
            import_usda_wasde.require_market_coverage(
                rapeseed_rows,
                markets,
            )

        import_usda_wasde.require_market_coverage(
            rapeseed_rows + oil_rows,
            markets,
        )

    def test_required_attribute_coverage_fails_on_partial_snapshot(self):
        markets = [{"market_name": "US Rapeseed Oil"}]
        required = set(
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed Oil"]
        )
        required.remove(import_usda_wasde.ENDING_STOCKS_ATTRIBUTE_ID)

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "missing attribute\\(s\\) 176",
        ):
            import_usda_wasde.require_market_coverage(
                self.snapshot_rows("US Rapeseed Oil", required),
                markets,
            )

    def test_required_mass_attribute_must_be_finite_tonnes(self):
        markets = [{"market_name": "US Rapeseed Oil"}]
        rows = self.snapshot_rows(
            "US Rapeseed Oil",
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed Oil"],
        )
        ending_stocks = next(
            row
            for row in rows
            if row["attribute_id"]
            == import_usda_wasde.ENDING_STOCKS_ATTRIBUTE_ID
        )
        ending_stocks["unit_id"] = 4
        ending_stocks["value"] = float("nan")

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "Invalid USDA PSD required attribute row",
        ):
            import_usda_wasde.require_market_coverage(rows, markets)

    def test_extra_wrong_unit_duplicate_is_rejected(self):
        markets = [{"market_name": "US Rapeseed Oil"}]
        rows = self.snapshot_rows(
            "US Rapeseed Oil",
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed Oil"],
        )
        duplicate = dict(
            next(
                row
                for row in rows
                if row["attribute_id"]
                == import_usda_wasde.ENDING_STOCKS_ATTRIBUTE_ID
            )
        )
        duplicate["unit_id"] = 4
        rows.append(duplicate)

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "attribute 176 has unit_id=4",
        ):
            import_usda_wasde.require_market_coverage(rows, markets)

    def test_direct_us_seed_and_oil_require_a_common_complete_snapshot(self):
        markets = [
            {"market_name": "US Rapeseed"},
            {"market_name": "US Rapeseed Oil"},
        ]
        seed_rows = self.snapshot_rows(
            "US Rapeseed",
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed"],
            month=7,
        )
        oil_rows = self.snapshot_rows(
            "US Rapeseed Oil",
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed Oil"],
            month=6,
        )

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "no common complete",
        ):
            import_usda_wasde.require_market_coverage(
                seed_rows + oil_rows,
                markets,
            )

    def test_normalization_rejects_upstream_identity_drift(self):
        market = next(
            market
            for market in import_usda_wasde.MARKETS
            if market["market_name"] == "US Rapeseed"
        )
        raw_row = {
            "commodityCode": "2222000",
            "countryCode": "US",
            "marketYear": "2026",
        }

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "commodityCode='2222000' expected '2226000'",
        ):
            import_usda_wasde.normalize_rows([raw_row], market, 2026)

    def test_normalization_rejects_invalid_report_month(self):
        market = next(
            market
            for market in import_usda_wasde.MARKETS
            if market["market_name"] == "US Rapeseed"
        )
        raw_row = {
            "commodityCode": "2226000",
            "countryCode": "US",
            "marketYear": "2026",
            "calendarYear": "2026",
            "month": "13",
            "attributeId": 28,
            "unitId": 8,
            "value": 1,
        }

        with self.assertRaisesRegex(
            import_usda_wasde.ImporterError,
            "invalid report period",
        ):
            import_usda_wasde.normalize_rows([raw_row], market, 2026)

    def test_all_admitted_markets_have_an_attribute_contract(self):
        self.assertEqual(
            set(import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET),
            {market["market_name"] for market in import_usda_wasde.MARKETS},
        )
        self.assertIn(
            7,
            import_usda_wasde.REQUIRED_ATTRIBUTES_BY_MARKET["US Rapeseed"],
        )

    def test_source_run_failure_is_fatal(self):
        with mock.patch.object(
            import_usda_wasde,
            "write_source_run",
            side_effect=import_usda_wasde.SourceRunError("ledger unavailable"),
        ):
            with self.assertRaisesRegex(
                import_usda_wasde.ImporterError,
                "this run is not successful",
            ):
                import_usda_wasde.record_source_run_or_fail(
                    "https://example.supabase.co",
                    "test-service-key",
                    source_name="usda_wasde_raw",
                )

    def test_direct_us_rapeseed_configs_use_official_psd_commodities(self):
        us_rapeseed = {
            row["market_name"]: row
            for row in import_usda_wasde.MARKETS
            if row["market_name"] in {"US Rapeseed", "US Rapeseed Oil"}
        }

        self.assertEqual(len(us_rapeseed), 2)
        self.assertEqual(
            {
                name: (
                    row["commodity_code"],
                    row["commodity_name"],
                    row["country_code"],
                    row["desk_heartbeat"],
                )
                for name, row in us_rapeseed.items()
            },
            {
                "US Rapeseed": (
                    "2226000",
                    "Oilseed, Rapeseed",
                    "US",
                    False,
                ),
                "US Rapeseed Oil": (
                    "4239100",
                    "Oil, Rapeseed",
                    "US",
                    False,
                ),
            },
        )

    def test_world_rapeseed_configs_remain_separate_and_unchanged(self):
        world_rapeseed = {
            row["market_name"]: row
            for row in import_usda_wasde.MARKETS
            if row["market_name"] in {"Rapeseed", "Rapeseed Oil"}
        }

        self.assertEqual(
            {
                name: (
                    row["commodity_code"],
                    row["commodity_name"],
                    row["country_code"],
                    row.get("scope"),
                )
                for name, row in world_rapeseed.items()
            },
            {
                "Rapeseed": (
                    "2226000",
                    "Oilseed, Rapeseed",
                    "00",
                    "world",
                ),
                "Rapeseed Oil": (
                    "4239100",
                    "Oil, Rapeseed",
                    "00",
                    "world",
                ),
            },
        )

    def test_us_rapeseed_uses_country_endpoints_not_world_or_proxy_lanes(self):
        requested_urls = []
        original_request_json = import_usda_wasde.request_json

        def fake_request_json(url, *, timeout):
            requested_urls.append(url)
            return []

        import_usda_wasde.request_json = fake_request_json
        try:
            for market_name in ("US Rapeseed", "US Rapeseed Oil"):
                market = next(
                    row
                    for row in import_usda_wasde.MARKETS
                    if row["market_name"] == market_name
                )
                rows = import_usda_wasde.fetch_rows(market, 2026, "test-key")
                self.assertEqual(rows, [])
        finally:
            import_usda_wasde.request_json = original_request_json

        self.assertEqual(len(requested_urls), 2)
        self.assertEqual(
            {
                url.split("/commodity/", 1)[1].split("?", 1)[0]
                for url in requested_urls
            },
            {
                "2226000/country/US/year/2026",
                "4239100/country/US/year/2026",
            },
        )
        for url in requested_urls:
            self.assertNotIn("/world/", url)
            self.assertNotIn("2222000", url)  # Soybeans
            self.assertNotIn("4232000", url)  # Soybean Oil


if __name__ == "__main__":
    unittest.main()
