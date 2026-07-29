import unittest
from unittest.mock import patch

from scripts.source_run import ALLOWED_SOURCE_LANES, SourceRunError, write_source_run


class SourceRunContractTests(unittest.TestCase):
    def test_allowed_lanes_match_database_constraint(self):
        self.assertEqual(
            ALLOWED_SOURCE_LANES,
            {
                "canada",
                "us",
                "cross_border",
                "farmer_local",
                "international",
                "analysis",
                "system",
            },
        )

    @patch("scripts.source_run.urllib.request.urlopen")
    def test_invalid_lane_fails_before_network_request(self, urlopen):
        with self.assertRaisesRegex(SourceRunError, "Invalid source_lane"):
            write_source_run(
                "https://example.supabase.co",
                "test-service-key",
                source_name="statcan_crush",
                source_lane="canada_official",
                collector_name="test",
                status="success",
            )

        urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
