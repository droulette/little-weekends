"""Check the exact JSON that Pages will serve, without network access."""
import json
from pathlib import Path
from collect_events import validate_event, canonical
from datetime import datetime

def main():
    path = Path(__file__).resolve().parents[1] / 'site/data/events.json'
    data = json.loads(path.read_text())
    assert data['schema_version'] == 1
    ids = []
    for event in data['events']:
        validate_event(event)
        ids.append(event['id'])
    assert len(ids) == len(set(ids)), 'Duplicate event IDs'
    assert data['sources'], 'Missing source statuses'
    assert all(s['id'] != 'bn' for s in data['sources']), 'Retired source present'
    for guide in data.get('guides', []):
        assert guide['source_id'] == '510'
        assert isinstance(guide['title'], str) and guide['title']
        canonical(guide['url'])
        for key in ('published_at', 'checked_at'):
            assert datetime.fromisoformat(guide[key].replace('Z', '+00:00')).tzinfo
        assert 'date' not in guide and 'start' not in guide, 'Article treated as event'
    print(f'Validated {len(ids)} event records and source status metadata.')

if __name__ == '__main__':
    main()
