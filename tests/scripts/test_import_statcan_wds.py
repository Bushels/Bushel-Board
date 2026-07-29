import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
MODULE_PATH = SCRIPTS_DIR / "import-statcan-wds.py"
spec = importlib.util.spec_from_file_location("import_statcan_wds", MODULE_PATH)
assert spec is not None
import_statcan_wds = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(import_statcan_wds)


class ImportStatcanBiofuelTests(unittest.TestCase):
    def test_pinned_biofuel_vectors_preserve_scope_and_units(self):
        self.assertEqual(
            import_statcan_wds.BIOFUEL_VECTORS,
            {
                1277885567: (
                    "Inputs",
                    "Vegetable oils, total",
                    "Metric tonnes",
                ),
                1277885586: (
                    "Production",
                    "Renewable fuels except fuel ethanol",
                    "Cubic metres",
                ),
            },
        )

    def test_biofuel_fetch_attaches_units_without_claiming_canola(self):
        original = import_statcan_wds.wds_post
        import_statcan_wds.wds_post = lambda _endpoint, _payload: [
            {
                "status": "SUCCESS",
                "object": {
                    "productId": 25100082,
                    "coordinate": "1.3.3",
                    "vectorId": 1277885567,
                    "vectorDataPoint": [
                        {
                            "refPer": "2026-04-01",
                            "value": 152578,
                            "statusCode": 0,
                            "scalarFactorCode": 0,
                        }
                    ],
                },
            }
        ]
        try:
            rows = import_statcan_wds.fetch_biofuel(4)
        finally:
            import_statcan_wds.wds_post = original

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["product_id"], 25100082)
        self.assertEqual(rows[0]["dim_group"], "Inputs")
        self.assertEqual(rows[0]["item"], "Vegetable oils, total")
        self.assertEqual(rows[0]["unit"], "Metric tonnes")
        self.assertNotIn("Canola", rows[0]["item"])


class ImportStatcanCoverageTests(unittest.TestCase):
    @staticmethod
    def vector_rows(group, ref_date="2026-04-01"):
        return [
            {
                "product_id": product_id,
                "vector_id": vector_id,
                "coordinate": coordinate,
                "ref_date": ref_date,
                "release_time": "2026-06-01T08:30",
                "value": 1,
            }
            for product_id, vector_id, coordinate
            in import_statcan_wds.REQUIRED_VECTOR_IDENTITIES[group]
        ]

    @staticmethod
    def field_rows():
        return [
            {
                "product_id": product_id,
                "coordinate": import_statcan_wds.coordinate(
                    geo_id, dim2, crop_id
                ),
                "ref_date": "2025-01-01",
                "release_time": "2026-05-06T08:30",
                "value": 1,
            }
            for product_id, geo_id, dim2, crop_id
            in import_statcan_wds.REQUIRED_CANOLA_FIELD_SERIES
        ]

    def test_all_pinned_biofuel_vectors_are_required(self):
        rows = [
            {
                "product_id": 25100082,
                "vector_id": 1277885567,
                "coordinate": "1.3.3.0.0.0.0.0.0.0",
                "ref_date": "2026-04-01",
                "release_time": "2026-06-01T08:30",
                "value": 152578,
            }
        ]

        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            "1277885586",
        ):
            import_statcan_wds.require_group_coverage("biofuel", rows)

    def test_canola_field_contract_requires_all_essential_series(self):
        rows = self.field_rows()
        import_statcan_wds.require_group_coverage("field_crops", rows)

        missing_row = rows.pop()
        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            missing_row["coordinate"].replace(".", r"\."),
        ):
                import_statcan_wds.require_group_coverage("field_crops", rows)

    def test_vector_identity_and_newest_period_are_coherent(self):
        rows = self.vector_rows("crush")
        import_statcan_wds.require_group_coverage("crush", rows)

        rows[0]["coordinate"] = "unexpected.coordinate"
        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            "unexpected source identity",
        ):
            import_statcan_wds.require_group_coverage("crush", rows)

        rows = self.vector_rows("crush")
        rows[0]["ref_date"] = "2026-03-01"
        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            "newest ref_date 2026-04-01",
        ):
            import_statcan_wds.require_group_coverage("crush", rows)

    def test_field_cohort_rejects_a_stale_province(self):
        rows = self.field_rows()
        seeded_area_rows = [
            row
            for row in rows
            if row["product_id"] == 32100359
            and ".1.16." in row["coordinate"]
        ]
        seeded_area_rows[0]["ref_date"] = "2024-01-01"

        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            "seeded_area cohort.*newest ref_date 2025-01-01",
        ):
            import_statcan_wds.require_group_coverage("field_crops", rows)

    def test_zero_is_valid_but_invalid_dates_and_nonfinite_values_fail(self):
        rows = self.vector_rows("biofuel")
        rows[0]["value"] = 0
        import_statcan_wds.require_group_coverage("biofuel", rows)

        rows[0]["ref_date"] = "not-a-date"
        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            "invalid ref_date",
        ):
            import_statcan_wds.require_group_coverage("biofuel", rows)

        rows = self.vector_rows("biofuel")
        rows[0]["value"] = float("nan")
        with self.assertRaisesRegex(
            import_statcan_wds.ImporterError,
            "non-finite value",
        ):
            import_statcan_wds.require_group_coverage("biofuel", rows)

    def test_partial_group_fails_before_upsert(self):
        with (
            mock.patch.object(
                sys,
                "argv",
                [str(MODULE_PATH), "--group", "biofuel"],
            ),
            mock.patch.object(import_statcan_wds, "load_env_files"),
            mock.patch.dict(
                import_statcan_wds.os.environ,
                {
                    "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
                },
                clear=False,
            ),
            mock.patch.object(
                import_statcan_wds,
                "fetch_biofuel",
                return_value=[
                    {
                        "product_id": 25100082,
                        "vector_id": 1277885567,
                        "coordinate": "1.3.3.0.0.0.0.0.0.0",
                        "ref_date": "2026-04-01",
                        "release_time": "2026-06-01T08:30",
                        "value": 1,
                    }
                ],
            ),
            mock.patch.object(import_statcan_wds, "upsert_rows") as upsert_mock,
        ):
            with self.assertRaisesRegex(
                import_statcan_wds.ImporterError,
                "1277885586",
            ):
                import_statcan_wds.main()

        upsert_mock.assert_not_called()

    def test_group_all_validates_every_group_before_first_write(self):
        with (
            mock.patch.object(
                sys,
                "argv",
                [str(MODULE_PATH), "--group", "all"],
            ),
            mock.patch.object(import_statcan_wds, "load_env_files"),
            mock.patch.dict(
                import_statcan_wds.os.environ,
                {
                    "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
                },
                clear=False,
            ),
            mock.patch.object(
                import_statcan_wds,
                "fetch_field_crops",
                return_value=self.field_rows(),
            ),
            mock.patch.object(
                import_statcan_wds,
                "fetch_crush",
                return_value=self.vector_rows("crush")[:-1],
            ),
            mock.patch.object(
                import_statcan_wds,
                "fetch_biofuel",
                return_value=self.vector_rows("biofuel"),
            ),
            mock.patch.object(import_statcan_wds, "upsert_rows") as upsert_mock,
        ):
            with self.assertRaisesRegex(
                import_statcan_wds.ImporterError,
                "missing required source identity",
            ):
                import_statcan_wds.main()

        upsert_mock.assert_not_called()

    def test_source_run_failure_is_fatal_after_idempotent_upsert(self):
        with mock.patch.object(
            import_statcan_wds,
            "write_source_run",
            side_effect=import_statcan_wds.SourceRunError("ledger unavailable"),
        ):
            with self.assertRaisesRegex(
                import_statcan_wds.ImporterError,
                "this run is not successful",
            ):
                import_statcan_wds.record_source_run_or_fail(
                    "https://example.supabase.co",
                    "test-service-key",
                    group="crush",
                    source_name="statcan_crush",
                )


if __name__ == "__main__":
    unittest.main()
