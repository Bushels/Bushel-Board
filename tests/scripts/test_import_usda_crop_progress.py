import importlib.util
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

spec = importlib.util.spec_from_file_location(
    "import_usda_crop_progress",
    SCRIPTS_DIR / "import-usda-crop-progress.py",
)
assert spec is not None
assert spec.loader is not None
usda = importlib.util.module_from_spec(spec)
spec.loader.exec_module(usda)


def raw(wheat_class, source_key, statcat, unit, value):
    return {
        "market_name": "Wheat",
        "commodity": "WHEAT",
        "cgc_grain": "Wheat",
        "source_key": source_key,
        "wheat_class": wheat_class,
        "class_desc": "WINTER" if wheat_class == "winter" else "SPRING, (EXCL DURUM)",
        "state": "US TOTAL",
        "week_ending": "2026-07-12",
        "crop_year": 2026,
        "report_year": 2026,
        "statisticcat_desc": statcat,
        "unit_desc": unit,
        "value_pct": value,
        "nass_load_time": "2026-07-13T20:00:00Z",
    }


class UsdaCropProgressImporterTests(unittest.TestCase):
    def test_wheat_classes_build_as_separate_canonical_rows(self):
        rows = [
            raw("winter", "winter", "PROGRESS", "PCT HARVESTED", 63),
            raw("winter", "winter", "CONDITION", "PCT GOOD", 21),
            raw("winter", "winter", "CONDITION", "PCT EXCELLENT", 5),
            raw("spring", "spring", "PROGRESS", "PCT HEADED", 72),
            raw("spring", "spring", "CONDITION", "PCT GOOD", 49),
            raw("spring", "spring", "CONDITION", "PCT EXCELLENT", 9),
        ]
        canonical, _warnings = usda.build_canonical_rows(rows)

        self.assertEqual(len(canonical), 2)
        by_class = {row["wheat_class"]: row for row in canonical}
        self.assertEqual(by_class["winter"]["harvested_pct"], 63)
        self.assertIsNone(by_class["winter"]["headed_pct"])
        self.assertEqual(by_class["winter"]["good_excellent_pct"], 26)
        self.assertEqual(by_class["spring"]["headed_pct"], 72)
        self.assertIsNone(by_class["spring"]["harvested_pct"])
        self.assertEqual(by_class["spring"]["good_excellent_pct"], 58)

    def test_summer_trajectory_selects_spring_without_merging_winter(self):
        canonical, _warnings = usda.build_canonical_rows([
            raw("winter", "winter", "PROGRESS", "PCT HARVESTED", 63),
            raw("spring", "spring", "PROGRESS", "PCT HEADED", 72),
        ])
        selected = usda.pick_latest_canonical_row(canonical, "WHEAT")
        self.assertIsNotNone(selected)
        self.assertEqual(selected["wheat_class"], "spring")
        self.assertEqual(selected["headed_pct"], 72)
        self.assertIsNone(selected["harvested_pct"])


if __name__ == "__main__":
    unittest.main()
