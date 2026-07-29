import importlib.util
import io
import json
import sys
import unittest
import urllib.parse
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
MODULE_PATH = SCRIPTS_DIR / "import-us-canola-customs.py"
spec = importlib.util.spec_from_file_location(
    "import_us_canola_customs",
    MODULE_PATH,
)
assert spec is not None
import_us_canola_customs = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(import_us_canola_customs)


def census_payload(
    product_code: str,
    *,
    month: str = "05",
    unit: str = "KG",
    consumption: str = "1250000",
    consumption_flag: str = "",
    general: str = "1300000",
    general_flag: str = "",
):
    headers = list(import_us_canola_customs.REQUEST_FIELDS) + ["time"]
    values_by_field = {
        "I_COMMODITY": product_code,
        "I_COMMODITY_LDESC": f"Official description {product_code}",
        "UNIT_QY1": unit,
        "CON_QY1_MO": consumption,
        "CON_QY1_MO_FLAG": consumption_flag,
        "GEN_QY1_MO": general,
        "GEN_QY1_MO_FLAG": general_flag,
        "CTY_CODE": "1220",
        "CTY_NAME": "CANADA",
        "YEAR": "2026",
        "MONTH": month,
        "LAST_UPDATE": "2026-07-03",
        "time": f"2026-{month}",
    }
    return [headers, [values_by_field[field] for field in headers]]


def release_payload(*months: str):
    headers = list(import_us_canola_customs.RELEASE_FIELDS) + ["time"]
    rows = [headers]
    for month in months:
        year, month_number = month.split("-")
        values_by_field = {
            "CTY_CODE": "1220",
            "CTY_NAME": "CANADA",
            "YEAR": year,
            "MONTH": month_number,
            "LAST_UPDATE": "2026-07-03",
            "time": month,
        }
        rows.append([values_by_field[field] for field in headers])
    return rows


def complete_rows():
    rows = []
    for code in sorted(import_us_canola_customs.EXPECTED_PRODUCT_CODES):
        rows.extend(
            import_us_canola_customs.parse_census_payload(
                census_payload(code),
                requested_product_code=code,
                fetched_at="2026-07-29T00:00:00+00:00",
            )
        )
    return rows


class ImportUsCanolaCustomsTests(unittest.TestCase):
    def test_admitted_codes_and_quantity_contract_are_exact(self):
        self.assertEqual(
            import_us_canola_customs.EXPECTED_PRODUCT_CODES,
            {
                "1205100010",
                "1205100020",
                "1205100090",
                "1514110000",
                "1514190000",
            },
        )
        self.assertEqual(
            import_us_canola_customs.CANONICAL_MEASURE,
            "CON_QY1_MO",
        )
        self.assertEqual(
            import_us_canola_customs.CROSS_CHECK_MEASURE,
            "GEN_QY1_MO",
        )
        self.assertFalse(
            any("VAL" in field for field in import_us_canola_customs.REQUEST_FIELDS)
        )

    def test_parser_uses_consumption_quantity_and_preserves_general_crosscheck(self):
        code = "1205100010"
        rows = import_us_canola_customs.parse_census_payload(
            census_payload(code),
            requested_product_code=code,
            fetched_at="2026-07-29T00:00:00+00:00",
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["report_month"], "2026-05-01")
        self.assertEqual(rows[0]["country_code"], "1220")
        self.assertEqual(rows[0]["unit_qy1"], "KG")
        self.assertEqual(rows[0]["consumption_qty_kg"], 1_250_000)
        self.assertEqual(rows[0]["general_qty_kg"], 1_300_000)
        self.assertNotIn("price", rows[0])
        self.assertNotIn("value", rows[0])

    def test_parser_fails_closed_on_missing_flag_and_wrong_unit(self):
        code = "1514110000"
        with self.assertRaisesRegex(
            import_us_canola_customs.ImporterError,
            "missing, not a true zero",
        ):
            import_us_canola_customs.parse_census_payload(
                census_payload(code, consumption_flag="M"),
                requested_product_code=code,
                fetched_at="2026-07-29T00:00:00+00:00",
            )

        with self.assertRaisesRegex(
            import_us_canola_customs.ImporterError,
            "UNIT_QY1 must be KG",
        ):
            import_us_canola_customs.parse_census_payload(
                census_payload(code, unit="T"),
                requested_product_code=code,
                fetched_at="2026-07-29T00:00:00+00:00",
            )

    def test_coverage_requires_every_code_in_every_month(self):
        rows = complete_rows()
        import_us_canola_customs.require_complete_coverage(rows)

        with self.assertRaisesRegex(
            import_us_canola_customs.ImporterError,
            "1514190000",
        ):
            import_us_canola_customs.require_complete_coverage(
                [
                    row
                    for row in rows
                    if row["product_code"] != "1514190000"
                ]
            )

    def test_released_month_discovery_returns_latest_n_not_calendar_n(self):
        with mock.patch.object(
            import_us_canola_customs,
            "request_json",
            return_value=release_payload(
                "2026-01",
                "2026-02",
                "2026-03",
                "2026-04",
                "2026-05",
            ),
        ):
            releases = import_us_canola_customs.discover_released_months(
                "census-key",
                exact_month=None,
                lookback_months=3,
                today=import_us_canola_customs.dt.date(2026, 7, 29),
            )

        self.assertEqual(
            list(releases),
            ["2026-03", "2026-04", "2026-05"],
        )

    def test_sparse_released_hts_month_becomes_explicit_zero(self):
        reported = complete_rows()
        reported = [
            row
            for row in reported
            if row["product_code"] != "1205100090"
        ]
        rows = import_us_canola_customs.complete_no_trade_rows(
            reported,
            released_months={"2026-05": "2026-07-03"},
            fetched_at="2026-07-29T00:00:00+00:00",
        )
        import_us_canola_customs.require_complete_coverage(rows)

        zero_row = next(
            row for row in rows if row["product_code"] == "1205100090"
        )
        self.assertEqual(zero_row["consumption_qty_kg"], 0)
        self.assertEqual(zero_row["general_qty_kg"], 0)
        self.assertEqual(zero_row["record_status"], "confirmed_no_trade")
        self.assertEqual(zero_row["api_last_update"], "2026-07-03")

    def test_http_204_is_an_official_no_row_result(self):
        fake_response = mock.MagicMock()
        fake_response.__enter__.return_value.status = 204

        with mock.patch.object(
            import_us_canola_customs.urllib.request,
            "urlopen",
            return_value=fake_response,
        ):
            payload = import_us_canola_customs.request_json(
                "https://api.census.gov/example",
                request_label="HTS test",
            )

        self.assertIsNone(payload)

    def test_request_is_scoped_to_canada_one_exact_hts_code_and_api_key(self):
        url = import_us_canola_customs.build_request_url(
            "1205100020",
            "2026-05",
            "secret-test-key",
        )
        parsed = urllib.parse.urlparse(url)
        query = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(query["CTY_CODE"], ["1220"])
        self.assertEqual(query["I_COMMODITY"], ["1205100020"])
        self.assertEqual(query["time"], ["2026-05"])
        self.assertEqual(query["key"], ["secret-test-key"])
        self.assertIn("CON_QY1_MO", query["get"][0])
        self.assertNotIn("CON_VAL_MO", query["get"][0])

    def test_ingest_is_one_atomic_rows_plus_source_run_request(self):
        rows = [
            {
                "report_month": "2026-05-01",
                "country_code": "1220",
                "product_code": "1205100010",
            }
        ]
        source_run = {
            "source_name": "us_census_canola_customs",
            "source_lane": "cross_border",
        }
        fake_response = mock.MagicMock()
        fake_response.__enter__.return_value.read.return_value = (
            b'{"id":"source-run-test"}'
        )

        with mock.patch.object(
            import_us_canola_customs.urllib.request,
            "urlopen",
            return_value=fake_response,
        ) as urlopen:
            result = import_us_canola_customs.ingest_rows(
                "https://example.supabase.co",
                "service-secret",
                rows,
                source_run,
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(request.method, "POST")
        self.assertIn(
            "/rest/v1/rpc/ingest_canola_us_customs",
            request.full_url,
        )
        self.assertEqual(
            json.loads(request.data),
            {
                "p_rows": rows,
                "p_source_run": source_run,
            },
        )
        self.assertEqual(result["id"], "source-run-test")

    def test_dry_run_never_requires_or_writes_supabase(self):
        rows = complete_rows()

        def fake_require_env(name, *_alternates):
            if name == "CENSUS_API_KEY":
                return "census-key"
            self.fail(f"dry run unexpectedly requested {name}")

        with (
            mock.patch.object(import_us_canola_customs, "load_env_files"),
            mock.patch.object(
                import_us_canola_customs,
                "require_env",
                side_effect=fake_require_env,
            ),
            mock.patch.object(
                import_us_canola_customs,
                "discover_released_months",
                return_value={"2026-05": "2026-07-03"},
            ),
            mock.patch.object(
                import_us_canola_customs,
                "fetch_rows",
                return_value=rows,
            ),
            mock.patch.object(
                import_us_canola_customs,
                "ingest_rows",
            ) as ingest,
            redirect_stdout(io.StringIO()),
            redirect_stderr(io.StringIO()),
        ):
            exit_code = import_us_canola_customs.main(
                ["--month", "2026-05", "--dry-run"]
        )

        self.assertEqual(exit_code, 0)
        ingest.assert_not_called()

    def test_write_run_records_cross_border_source_lane(self):
        rows = complete_rows()
        env_values = {
            "CENSUS_API_KEY": "census-key",
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "service-key",
        }

        with (
            mock.patch.object(import_us_canola_customs, "load_env_files"),
            mock.patch.object(
                import_us_canola_customs,
                "require_env",
                side_effect=lambda name, *_alternates: env_values[name],
            ),
            mock.patch.object(
                import_us_canola_customs,
                "discover_released_months",
                return_value={"2026-05": "2026-07-03"},
            ),
            mock.patch.object(
                import_us_canola_customs,
                "fetch_rows",
                return_value=rows,
            ),
            mock.patch.object(
                import_us_canola_customs,
                "ingest_rows",
                return_value={"id": "source-run-test"},
            ) as ingest,
            redirect_stdout(io.StringIO()),
            redirect_stderr(io.StringIO()),
        ):
            exit_code = import_us_canola_customs.main(
                ["--month", "2026-05"]
        )

        self.assertEqual(exit_code, 0)
        ingest.assert_called_once()
        source_run = ingest.call_args.args[3]
        self.assertEqual(
            source_run["source_lane"],
            "cross_border",
        )
        self.assertEqual(
            source_run["source_name"],
            "us_census_canola_customs",
        )


if __name__ == "__main__":
    unittest.main()
