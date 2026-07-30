import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

spec = importlib.util.spec_from_file_location(
    "build_prairie_crop_progress_report",
    SCRIPTS_DIR / "build-prairie-crop-progress-report.py",
)
assert spec is not None
assert spec.loader is not None
prairie = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prairie)


def observation(
    province_code: str,
    crop_name: str,
    metric: str,
    value_pct: float,
    *,
    report_date: str,
    region_code: str = "PROV",
    region_name: str | None = None,
    canonical_grain: str | None = None,
    quality_flags: list[str] | None = None,
) -> dict:
    province_name = prairie.canada.PROVINCE_NAMES[province_code]
    return {
        "province_code": province_code,
        "province_name": province_name,
        "report_date": report_date,
        "release_date": report_date,
        "crop_name": crop_name,
        "canonical_grain": canonical_grain,
        "region_code": region_code,
        "region_name": region_name or province_name,
        "metric": metric,
        "value_pct": value_pct,
        "confidence": "medium" if quality_flags else "high",
        "quality_flags": quality_flags or [],
        "source_excerpt": f"{province_name} source excerpt.",
        "document_url": f"https://example.test/{province_code.lower()}.pdf",
        "report_label": f"{province_name} Crop Report - {report_date}",
    }


class PrairieCropProgressReportTests(unittest.TestCase):
    def test_manitoba_late_phase_watch_keeps_narrative_outside_numeric_rows(self):
        report_text = """
        The majority of spring cereals are in early milk to soft dough stage.
        Fungicide applications for fusarium head blight are generally complete.
        Canola development has continued rapidly and is generally in stages of flowering,
        with the earliest fields past flowering.
        Areas that have been under excess moisture continue to show symptoms of stress and
        soil crusting. Field access remains a challenge in some areas where washouts occurred.
        Waterlogged fields, particularly in Woodlands and Rosser, are showing premature
        ripening and yellowing leaves.
        """

        watch = prairie.extract_manitoba_late_phase_watch(report_text)

        self.assertEqual(len(watch), 4)
        self.assertIn("early milk to soft dough", watch[0])
        self.assertIn("past flowering", watch[1])
        self.assertIn("access limits", watch[2])
        self.assertIn("Woodlands and Rosser", watch[3])

    def test_late_phase_package_preserves_province_specific_boundaries(self):
        rows = [
            observation(
                "MB",
                "All Crops",
                "condition_good_excellent_pct",
                50.0,
                report_date="2026-07-28",
                region_code="SW",
                region_name="Southwest",
                quality_flags=["broad_all_crops_narrative"],
            ),
            observation(
                "SK",
                "Hayland",
                "soil_moisture_adequate_surplus_pct",
                89.0,
                report_date="2026-07-20",
            ),
            observation(
                "AB",
                "Canola",
                "condition_good_excellent_pct",
                54.2,
                report_date="2026-07-21",
                canonical_grain="Canola",
            ),
        ]
        summaries = [
            {
                "province": code,
                "source_url": f"https://example.test/{code.lower()}.pdf",
                "discovery": {"report_date": date},
            }
            for code, date in (
                ("MB", "2026-07-28"),
                ("SK", "2026-07-23"),
                ("AB", "2026-07-21"),
            )
        ]
        sources = prairie.province_sources(summaries)

        package = prairie.build_late_phase_package(
            started_at="2026-07-29T00:00:00+00:00",
            rows=rows,
            summaries=summaries,
            sources=sources,
            narrative_watch_by_province={
                "MB": ["Spring cereals are in early milk to soft dough."],
            },
        )

        self.assertEqual(package["report_phase"], "condition_and_development")
        self.assertEqual(package["source_period_end"], "2026-07-28")
        self.assertEqual(package["rows_parsed"], 3)
        self.assertEqual(
            package["provinces"]["MB"]["display_observations"][0]["boundary"],
            "context_only_broad_all_crops",
        )
        self.assertEqual(
            package["provinces"]["AB"]["display_observations"][0]["boundary"],
            "crop_specific_observation",
        )

        markdown = prairie.build_late_phase_markdown(package)
        self.assertIn("Manitoba's Southwest all-crops condition is context-only", markdown)
        self.assertIn("Narrative watch:", markdown)
        self.assertIn("Spring cereals are in early milk to soft dough.", markdown)
        self.assertIn("| Canola | Alberta | good/excellent | 54.2% |", markdown)
        self.assertNotIn("seeding is 96% complete", markdown)
        self.assertNotIn("Stonewall", markdown)

        svg = prairie.build_late_phase_svg(package)
        self.assertIn("Prairie Late-Season Structured Watch", svg)
        self.assertIn("no automatic Wheat/Canola thesis or score change", svg)

    def test_late_phase_writer_emits_only_phase_appropriate_outputs(self):
        rows = [
            observation(
                "MB",
                "All Crops",
                "condition_good_excellent_pct",
                50.0,
                report_date="2026-07-28",
                region_code="SW",
                region_name="Southwest",
                quality_flags=["broad_all_crops_narrative"],
            )
        ]
        summaries = [
            {
                "province": code,
                "source_url": f"https://example.test/{code.lower()}.pdf",
                "discovery": {"report_date": "2026-07-28"},
            }
            for code in ("MB", "SK", "AB")
        ]
        package = prairie.build_late_phase_package(
            started_at="2026-07-29T00:00:00+00:00",
            rows=rows,
            summaries=summaries,
            sources=prairie.province_sources(summaries),
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            stale = output_dir / "infographic-seeding-crop-progress.svg"
            stale.write_text("stale", encoding="utf-8")

            files = prairie.write_package(package, output_dir)

            self.assertEqual(
                set(files),
                {"summary_json", "report_md", "late_season_svg", "index_html"},
            )
            self.assertFalse(stale.exists())
            self.assertTrue((output_dir / "infographic-late-season-watch.svg").exists())


if __name__ == "__main__":
    unittest.main()
