"""Archive real public Weathercloud readings for the GitHub-Pages PWA."""
from __future__ import annotations
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
STATION = os.getenv('WEATHERCLOUD_STATION', '1073176104')
LOCAL = ZoneInfo('Europe/Berlin')


def num(value):
    try:
        result = float(value) if value is not None else None
        return result if result is not None and math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def stat(stats, key, stamp):
    value = stats.get(key)
    if isinstance(value, (list, tuple)) and len(value) > 1:
        epoch, total = num(value[0]), num(value[1])
        if epoch is not None and abs(epoch - stamp.timestamp()) <= 1200:
            return total if total is not None and total >= 0 else None
    return None


def parse_stamp(value):
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('Station timestamp must include a timezone')
    return stamp.astimezone(timezone.utc)


def write_json(file, value, indent=None):
    temporary = file.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                                   indent=indent) + '\n', encoding='utf8')
    temporary.replace(file)


def archive_item(item, directory=DATA):
    """Idempotent by instant, including legacy local-offset timestamps."""
    stamp = parse_stamp(item['timestamp'])
    item = dict(item, timestamp=stamp.isoformat().replace('+00:00', 'Z'))
    directory.mkdir(parents=True, exist_ok=True)
    file = directory / f'{stamp.astimezone(LOCAL):%Y-%m}.json'
    rows = json.loads(file.read_text(encoding='utf8')) if file.exists() else []
    by_time = {parse_stamp(row['timestamp']): row for row in rows}
    # Repeated/stale readings must not replace previously recorded counters.
    by_time.setdefault(stamp, item)
    write_json(file, [by_time[key] for key in sorted(by_time)])
    latest_file = directory / 'latest.json'
    latest = json.loads(latest_file.read_text(encoding='utf8')) if latest_file.exists() else None
    if latest is None or parse_stamp(latest['timestamp']) < stamp:
        write_json(latest_file, item, indent=2)
    return file


def main():
    from weathercloud import WeathercloudClient
    with WeathercloudClient(timeout=20) as client:
        current = client.get_current_conditions(STATION)
        stats = client.get_device_stats(STATION)
    epoch = num(current.epoch)
    if epoch is None or epoch <= 0:
        raise ValueError('Missing station timestamp; no artificial reading is archived')
    stamp = datetime.fromtimestamp(epoch, tz=timezone.utc)
    if stamp.timestamp() > datetime.now(timezone.utc).timestamp() + 900:
        raise ValueError('Station timestamp is in the future')
    temperature = num(current.temperature)
    feels = (num(current.heat_index) if temperature is not None and temperature >= 27
             else num(current.wind_chill) if temperature is not None and temperature <= 10 else None)
    rate = num(current.rain_rate)
    item = {'timestamp': stamp.isoformat(), 'temperature': temperature, 'feels': feels,
            'rain_rate': rate if rate is not None and rate >= 0 else None,
            'rain_day': stat(stats, 'rain_day_total', stamp),
            'rain_month': stat(stats, 'rain_month_total', stamp),
            'wind_speed': num(current.wind_speed) * 3.6 if num(current.wind_speed) is not None else None,
            'wind_direction': num(current.wind_direction)}
    file = archive_item(item)
    print(f'Archived {stamp.isoformat()} at {file.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
