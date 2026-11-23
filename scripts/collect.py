"""Archive public Weathercloud readings for the mobile PWA.
Run by a scheduled GitHub Action. Missing fields remain null.
"""
from __future__ import annotations
import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from weathercloud import WeathercloudClient

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
STATION = os.getenv('WEATHERCLOUD_STATION', '1073176104')
LOCAL = ZoneInfo('Europe/Berlin')

def num(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None

def stat(stats, key):
    v = stats.get(key)
    if isinstance(v, (list, tuple)) and len(v) > 1:
        return num(v[1])
    return None

def main():
    with WeathercloudClient(timeout=20) as client:
        current = client.get_current_conditions(STATION)
        stats = client.get_device_stats(STATION)
    stamp = datetime.fromtimestamp(current.epoch, tz=LOCAL) if current.epoch else datetime.now(LOCAL)
    # Heat index and wind chill are conditional approximations, not always a valid feels-like reading.
    feels = num(current.heat_index) if num(current.heat_index) is not None and num(current.temperature) is not None and current.temperature >= 27 else (num(current.wind_chill) if num(current.wind_chill) is not None and num(current.temperature) is not None and current.temperature <= 10 else None)
    item = {'timestamp': stamp.isoformat(), 'temperature': num(current.temperature),
            'feels': feels, 'rain_rate': num(current.rain_rate),
            'rain_day': stat(stats, 'rain_day_total'),
            'rain_month': stat(stats, 'rain_month_total'),
            'wind_speed': num(current.wind_speed) * 3.6 if num(current.wind_speed) is not None else None,
            'wind_direction': num(current.wind_direction)}
    month = stamp.strftime('%Y-%m')
    file = DATA / f'{month}.json'
    data = json.loads(file.read_text(encoding='utf8')) if file.exists() else []
    if not any(v.get('timestamp') == item['timestamp'] for v in data):
        data.append(item)
        data.sort(key=lambda v:v['timestamp'])
        file.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    (DATA / 'latest.json').write_text(json.dumps(item, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'Archived {item["timestamp"]} at {file.relative_to(ROOT)}')

if __name__ == '__main__':
    main()
