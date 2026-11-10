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
    assert isinstance(data['sources'], list) and data['sources'], 'Missing source statuses'
    source_ids=[]
    for source in data['sources']:
        assert isinstance(source,dict), 'Invalid source status'
        assert all(isinstance(source.get(k),str) and source[k] for k in ['id','name','url','mode','state']), 'Invalid source metadata'
        assert source['mode'] in {'automatic','manual'}, 'Invalid source mode'
        assert source['state'] in {'ok','error','not_run','manual'}, 'Invalid source state'
        canonical(source['url'])
        source_ids.append(source['id'])
    assert len(source_ids)==len(set(source_ids)), 'Duplicate source IDs'
    assert 'bn' not in source_ids, 'Retired source present'
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
