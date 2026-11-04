"""Check the exact JSON that Pages will serve, without network access."""
import json
from pathlib import Path
from collect_events import validate_event

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
    print(f'Validated {len(ids)} event records and source status metadata.')

if __name__ == '__main__':
    main()
