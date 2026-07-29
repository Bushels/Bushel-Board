import importlib.util
import json
import pathlib
import sys
import unittest
from unittest import mock


MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "scripts"
    / "hermes"
    / "run_bushel_job.py"
)
SPEC = importlib.util.spec_from_file_location("run_bushel_job", MODULE_PATH)
assert SPEC and SPEC.loader
run_bushel_job = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = run_bushel_job
SPEC.loader.exec_module(run_bushel_job)


class RunBushelJobTests(unittest.TestCase):
    def test_alias_filename_selects_only_admitted_job(self):
        self.assertEqual(
            run_bushel_job.resolve_job_name(
                None, "C:/Users/kyle/.hermes/scripts/bushel-collect-cgc.py"
            ),
            "bushel-collect-cgc",
        )
        with self.assertRaises(ValueError):
            run_bushel_job.resolve_job_name(
                None, "C:/Users/kyle/.hermes/scripts/arbitrary.py"
            )

    def test_canola_collectors_are_mapped_to_bounded_npm_targets(self):
        expected = {
            "bushel-collect-cgc": "collect:cgc",
            "bushel-collect-grain-monitor": "collect:grain-monitor",
            "bushel-collect-producer-cars": "collect:producer-cars",
            "bushel-collect-cftc-cot": "collect:cftc-cot",
            "bushel-collect-wasde": "collect:wasde",
            "bushel-collect-statcan": "collect:statcan",
            "bushel-collect-sk-prices": "collect:sk-prices",
            "bushel-collect-us-customs": "collect:us-customs",
            "bushel-collect-aafc-canola": "collect:aafc-canola",
            "bushel-collect-eia-canola": "collect:eia-canola",
        }
        for job_name, npm_target in expected.items():
            with self.subTest(job_name=job_name):
                self.assertEqual(
                    run_bushel_job.JOBS[job_name].commands,
                    (("run", npm_target),),
                )

    def test_every_admitted_npm_target_exists(self):
        package_json = json.loads(
            (MODULE_PATH.parents[2] / "package.json").read_text(
                encoding="utf-8"
            )
        )
        npm_scripts = set(package_json["scripts"])

        for job_name, job in run_bushel_job.JOBS.items():
            for command in job.commands:
                with self.subTest(job_name=job_name, command=command):
                    self.assertEqual(command[0], "run")
                    self.assertIn(command[1], npm_scripts)

    def test_watchdog_success_is_silent(self):
        with (
            mock.patch.object(
                run_bushel_job,
                "resolve_root",
                return_value=MODULE_PATH.parents[2],
            ),
            mock.patch.object(
                run_bushel_job, "resolve_npm", return_value="npm.cmd"
            ),
            mock.patch.object(
                run_bushel_job,
                "run_npm",
                return_value=mock.Mock(
                    stdout="ok", stderr="", returncode=0
                ),
            ),
            mock.patch.object(
                run_bushel_job.Path,
                "write_text",
                autospec=True,
            ),
            mock.patch("builtins.print") as print_mock,
        ):
            code = run_bushel_job.main(
                ["--job", "bushel-source-freshness"]
            )

        self.assertEqual(code, 0)
        print_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
