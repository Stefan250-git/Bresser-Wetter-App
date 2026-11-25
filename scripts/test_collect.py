"""Offline tests: python -m unittest discover -s scripts -p 'test_*.py'."""
import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from collect import archive_item, num, stat, parse_stamp, main


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
        midnight = parse_stamp('2026-12-01T00:05:00+01:00')
        previous = midnight.timestamp() - 600
        for key in ['rain_day_total', 'rain_month_total']:
            self.assertIsNone(stat({key: [previous, 12]}, key, midnight))
        with self.assertRaises(ValueError):
            parse_stamp('2026-11-01T12:00:00')

    def test_collection_pipeline_with_realistic_mock_responses(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            current = SimpleNamespace(epoch=parse_stamp('2026-11-01T12:00:00Z').timestamp(),
                                      temperature=-2, heat_index=None, wind_chill=-4,
                                      rain_rate=1.2, wind_speed=2, wind_direction=180)
            client = MagicMock()
            client.__enter__.return_value = client
            client.get_current_conditions.return_value = current
            client.get_device_stats.return_value = {'rain_month_total': [current.epoch, 3]}
            package = SimpleNamespace(WeathercloudClient=lambda **kwargs: client)
            with patch.dict('sys.modules', weathercloud=package), patch('collect.ROOT', directory), \
                    patch('collect.archive_item', side_effect=lambda item: archive_item(item, directory)):
                main()
                main()  # repeated job with same station reading
                current.epoch += 600
                client.get_device_stats.return_value = {'rain_month_total': [current.epoch, 3.2]}
                main()
            rows = json.loads((directory / '2026-11.json').read_text())
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[-1]['timestamp'], '2026-11-01T12:10:00Z')
            self.assertEqual(rows[-1]['feels'], -4)
            self.assertEqual(rows[-1]['rain_rate'], 1.2)
            self.assertEqual(rows[-1]['wind_speed'], 7.2)
            self.assertIsNone(rows[-1]['rain_day'])

    def test_missing_station_timestamp_does_not_create_history(self):
        client = MagicMock()
        client.__enter__.return_value = client
        client.get_current_conditions.return_value = SimpleNamespace(epoch=None)
        with patch.dict('sys.modules', weathercloud=SimpleNamespace(WeathercloudClient=lambda **kwargs: client)), \
                patch('collect.archive_item') as write:
            with self.assertRaises(ValueError):
                main()
            write.assert_not_called()


if __name__ == '__main__':
    unittest.main()
