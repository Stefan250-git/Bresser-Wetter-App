"""Offline tests: python -m unittest discover -s scripts -p 'test_*.py'."""
import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from collect import archive_item, num, stat, parse_stamp


class ArchiveTests(unittest.TestCase):
    def test_persistence_deduplication_and_stale_readings(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            first = {'timestamp': '2026-11-01T00:10:00+01:00', 'temperature': -3}
            archive_item(first, directory)
            archive_item(dict(first, timestamp='2026-10-31T23:10:00Z'), directory)
            rows = json.loads((directory / '2026-11.json').read_text())
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['timestamp'], '2026-10-31T23:10:00Z')
            archive_item(dict(first, timestamp='2026-11-01T00:20:00+01:00'), directory)
            archive_item(first, directory)
            self.assertEqual(len(json.loads((directory / '2026-11.json').read_text())), 2)
            self.assertEqual(json.loads((directory / 'latest.json').read_text())['timestamp'],
                             '2026-10-31T23:20:00Z')

    def test_dst_repeated_hour_is_two_distinct_instants(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for offset in ['+02:00', '+01:00']:
                archive_item({'timestamp': '2026-10-25T02:30:00' + offset}, directory)
            self.assertEqual(len(json.loads((directory / '2026-10.json').read_text())), 2)

    def test_invalid_values_and_stat_time(self):
        for value in [None, 'bad', float('nan'), float('inf')]:
            self.assertIsNone(num(value))
        stamp = datetime(2026, 11, 1, tzinfo=timezone.utc)
        self.assertEqual(stat({'rain': [stamp.timestamp(), 0]}, 'rain', stamp), 0)
        self.assertIsNone(stat({'rain': [stamp.timestamp() - 3600, 7]}, 'rain', stamp))
        self.assertIsNone(stat({'rain': [stamp.timestamp(), -1]}, 'rain', stamp))
        with self.assertRaises(ValueError):
            parse_stamp('2026-11-01T12:00:00')


if __name__ == '__main__':
    unittest.main()
