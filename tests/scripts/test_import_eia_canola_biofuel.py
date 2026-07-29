import importlib.util
import io
import json
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
MODULE_PATH = SCRIPTS_DIR / "import-eia-canola-biofuel.py"
spec = importlib.util.spec_from_file_location(
    "import_eia_canola_biofuel",
    MODULE_PATH,
)
assert spec is not None
import_eia_canola_biofuel = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(import_eia_canola_biofuel)


def eia_html(
    *,
    months=None,
    values=None,
    title="Total Canola Oil",
    unit="(Million Pounds)",
    release_date="6/30/2026",
    next_release_date="7/31/2026",
    series_id="M_EPOOBDCO_YIFBP_NUS_MMLB",
):
    months = months or [
        "Nov-25",
        "Dec-25",
        "Jan-26",
        "Feb-26",
        "Mar-26",
        "Apr-26",
    ]
    values = values or ["276", "301", "189", "189", "403", "365"]
    headers = "".join(
        f'<th class="Series5">{month}</th>' for month in months
    )
    cells = "".join(
        f'<td class="{"Current2" if index == len(values) - 1 else "DataB"}">'
        f"{value}</td>"
        for index, value in enumerate(values)
    )
    return f"""
    <html>
      <head><title>{title}</title></head>
      <body>
        <td class="TitleUnit">{unit}</td>
        <a href="./hist/example?s={series_id}">history</a>
        <table>
          <tr>{headers}</tr>
          <tr class="DataRow">
            <td class="DataStub">
              <table><tr><td class="DataStub1"><b>U.S.</b></td></tr></table>
            </td>
            {cells}
            <td class="DataHist">2021-2026</td>
          </tr>
        </table>
        <td class="Update">Release Date: {release_date}</td>
        <td>Next Release Date: {next_release_date}</td>
      </body>
    </html>
    """


class ImportEiaCanolaBiofuelTests(unittest.TestCase):
    def test_parser_extracts_exact_official_series_and_units(self):
        rows, metadata = import_eia_canola_biofuel.parse_eia_html(
            eia_html(),
            retrieved_at="2026-07-29T00:00:00+00:00",
        )

        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[0]["report_month"], "2025-11-01")
        self.assertEqual(rows[-1]["report_month"], "2026-04-01")
        self.assertEqual(rows[-1]["consumed_million_lb"], "365")
        self.assertEqual(rows[-1]["unit"], "million pounds")
        self.assertEqual(
            rows[-1]["series_id"],
            "M_EPOOBDCO_YIFBP_NUS_MMLB",
        )
        self.assertEqual(
            metadata["release_date"],
            "2026-06-30",
        )
        self.assertEqual(
            metadata["next_release_date"],
            "2026-07-31",
        )
        self.assertTrue(metadata["demand_confirmation_only"])
        self.assertEqual(metadata["origin_scope"], "not_reported")
        self.assertNotIn("canadian", json.dumps(rows).casefold())

    def test_withheld_or_unavailable_value_is_not_zero_filled(self):
        for marker in ("-", "--", "NA", "W", ""):
            values = ["276", "301", "189", marker, "403", "365"]
            with self.subTest(marker=marker):
                with self.assertRaisesRegex(
                    import_eia_canola_biofuel.ImporterError,
                    "refusing to publish it as zero",
                ):
                    import_eia_canola_biofuel.parse_eia_html(
                        eia_html(values=values),
                        retrieved_at="2026-07-29T00:00:00+00:00",
                    )

    def test_partial_duplicate_or_gapped_month_window_fails_closed(self):
        with self.assertRaisesRegex(
            import_eia_canola_biofuel.ImporterError,
            "exactly six",
        ):
            import_eia_canola_biofuel.parse_eia_html(
                eia_html(
                    months=["Dec-25", "Jan-26"],
                    values=["301", "189"],
                ),
                retrieved_at="2026-07-29T00:00:00+00:00",
            )

        with self.assertRaisesRegex(
            import_eia_canola_biofuel.ImporterError,
            "consecutive",
        ):
            import_eia_canola_biofuel.parse_eia_html(
                eia_html(
                    months=[
                        "Oct-25",
                        "Nov-25",
                        "Dec-25",
                        "Feb-26",
                        "Mar-26",
                        "Apr-26",
                    ],
                ),
                retrieved_at="2026-07-29T00:00:00+00:00",
            )

    def test_title_unit_and_series_are_pinned(self):
        fixtures = (
            ({"title": "Soybean Oil"}, "title contract changed"),
            ({"unit": "(Thousand Barrels)"}, "unit contract changed"),
            ({"series_id": "M_WRONG"}, "series contract changed"),
        )
        for kwargs, expected in fixtures:
            with self.subTest(kwargs=kwargs):
                with self.assertRaisesRegex(
                    import_eia_canola_biofuel.ImporterError,
                    expected,
                ):
                    import_eia_canola_biofuel.parse_eia_html(
                        eia_html(**kwargs),
                        retrieved_at="2026-07-29T00:00:00+00:00",
                    )

    def test_dry_run_never_requires_or_writes_supabase(self):
        with (
            mock.patch.object(
                import_eia_canola_biofuel,
                "load_env_files",
            ),
            mock.patch.object(
                import_eia_canola_biofuel,
                "fetch_html",
                return_value=eia_html(),
            ),
            mock.patch.object(
                import_eia_canola_biofuel,
                "require_env",
            ) as require_env,
            mock.patch.object(
                import_eia_canola_biofuel,
                "ingest_rows",
            ) as ingest,
            redirect_stdout(io.StringIO()) as stdout,
            redirect_stderr(io.StringIO()),
        ):
            exit_code = import_eia_canola_biofuel.main(["--dry-run"])

        self.assertEqual(exit_code, 0)
        require_env.assert_not_called()
        ingest.assert_not_called()
        summary = json.loads(stdout.getvalue())
        self.assertEqual(summary["status"], "success")
        self.assertTrue(summary["dry_run"])
        self.assertEqual(summary["rows"], 6)
        self.assertIn("origin is not reported", summary["interpretation"])

    def test_write_uses_one_atomic_rows_plus_source_run_request(self):
        rows, metadata = import_eia_canola_biofuel.parse_eia_html(
            eia_html(),
            retrieved_at="2026-07-29T00:00:00+00:00",
        )
        source_run = {
            "source_name": "us_eia_canola_biofuel_feedstock",
            "source_lane": "us",
            "metadata": metadata,
        }
        fake_response = mock.MagicMock()
        fake_response.__enter__.return_value.read.return_value = (
            b'{"id":"source-run-test"}'
        )

        with mock.patch.object(
            import_eia_canola_biofuel.urllib.request,
            "urlopen",
            return_value=fake_response,
        ) as urlopen:
            result = import_eia_canola_biofuel.ingest_rows(
                "https://example.supabase.co",
                "service-secret",
                rows,
                source_run,
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(request.method, "POST")
        self.assertIn(
            "/rest/v1/rpc/ingest_eia_canola_biofuel_feedstock",
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

    def test_main_marks_lane_us_and_origin_unreported(self):
        env_values = {
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "service-key",
        }
        with (
            mock.patch.object(
                import_eia_canola_biofuel,
                "load_env_files",
            ),
            mock.patch.object(
                import_eia_canola_biofuel,
                "fetch_html",
                return_value=eia_html(),
            ),
            mock.patch.object(
                import_eia_canola_biofuel,
                "require_env",
                side_effect=lambda name, *_alternates: env_values[name],
            ),
            mock.patch.object(
                import_eia_canola_biofuel,
                "ingest_rows",
                return_value={"id": "source-run-test"},
            ) as ingest,
            redirect_stdout(io.StringIO()),
            redirect_stderr(io.StringIO()),
        ):
            exit_code = import_eia_canola_biofuel.main([])

        self.assertEqual(exit_code, 0)
        source_run = ingest.call_args.args[3]
        self.assertEqual(source_run["source_lane"], "us")
        self.assertEqual(
            source_run["source_name"],
            "us_eia_canola_biofuel_feedstock",
        )
        self.assertEqual(
            source_run["metadata"]["origin_scope"],
            "not_reported",
        )
        self.assertTrue(
            source_run["metadata"]["demand_confirmation_only"]
        )

    def test_atomic_rpc_failure_is_fatal(self):
        rows, metadata = import_eia_canola_biofuel.parse_eia_html(
            eia_html(),
            retrieved_at="2026-07-29T00:00:00+00:00",
        )
        http_error = import_eia_canola_biofuel.urllib.error.HTTPError(
            url="https://example.supabase.co/rest/v1/rpc/example",
            code=500,
            msg="failure",
            hdrs=None,
            fp=io.BytesIO(b"source_runs constraint failed"),
        )
        with (
            mock.patch.object(
                import_eia_canola_biofuel.urllib.request,
                "urlopen",
                side_effect=http_error,
            ),
            self.assertRaisesRegex(
                import_eia_canola_biofuel.ImporterError,
                "No successful run was recorded",
            ),
        ):
            import_eia_canola_biofuel.ingest_rows(
                "https://example.supabase.co",
                "service-key",
                rows,
                {"metadata": metadata},
            )


if __name__ == "__main__":
    unittest.main()
