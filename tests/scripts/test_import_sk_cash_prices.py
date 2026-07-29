import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
MODULE_PATH = SCRIPTS_DIR / "import-sk-cash-prices.py"
spec = importlib.util.spec_from_file_location("import_sk_cash_prices", MODULE_PATH)
assert spec is not None
import_sk_cash_prices = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(import_sk_cash_prices)


class ImportSkCashPricesTests(unittest.TestCase):
    def test_header_only_source_fails_before_any_write(self):
        with (
            mock.patch.object(
                sys,
                "argv",
                [
                    str(MODULE_PATH),
                    "--crops",
                    "canola",
                    "--since",
                    "2026-01-01",
                ],
            ),
            mock.patch.object(import_sk_cash_prices, "load_env_files"),
            mock.patch.dict(
                import_sk_cash_prices.os.environ,
                {
                    "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
                },
                clear=False,
            ),
            mock.patch.object(
                import_sk_cash_prices,
                "fetch_csv",
                return_value="Date,Average Price ($/tonne)\n",
            ),
            mock.patch.object(import_sk_cash_prices, "upsert_rows") as upsert_mock,
            mock.patch.object(
                import_sk_cash_prices, "write_source_run"
            ) as source_run_mock,
        ):
            with self.assertRaisesRegex(
                import_sk_cash_prices.ImporterError,
                "no usable rows.*canola",
            ):
                import_sk_cash_prices.main()

        upsert_mock.assert_not_called()
        source_run_mock.assert_not_called()

    def test_source_run_failure_makes_completed_upsert_nonzero(self):
        raw_csv = (
            "Date,Average Price ($/tonne)\n"
            "2026/07/22,650.25\n"
        )
        with (
            mock.patch.object(
                sys,
                "argv",
                [
                    str(MODULE_PATH),
                    "--crops",
                    "canola",
                    "--since",
                    "2026-01-01",
                ],
            ),
            mock.patch.object(import_sk_cash_prices, "load_env_files"),
            mock.patch.dict(
                import_sk_cash_prices.os.environ,
                {
                    "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
                },
                clear=False,
            ),
            mock.patch.object(
                import_sk_cash_prices,
                "fetch_csv",
                return_value=raw_csv,
            ),
            mock.patch.object(import_sk_cash_prices, "upsert_rows") as upsert_mock,
            mock.patch.object(
                import_sk_cash_prices,
                "write_source_run",
                side_effect=import_sk_cash_prices.SourceRunError("ledger unavailable"),
            ),
        ):
            with self.assertRaisesRegex(
                import_sk_cash_prices.ImporterError,
                "source_runs ledger write failed",
            ):
                import_sk_cash_prices.main()

        upsert_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
