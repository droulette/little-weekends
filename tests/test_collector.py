"""Small synthetic fixtures: exercise failure modes, not third-party snapshots."""
import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect_events import parse_ikea, parse_opl, parse_schema_event, ages, merge_events, dedupe, validate_event

NOW=datetime(2026,11,4,20,tzinfo=timezone.utc)
IKEA={'id':'ikea','name':'IKEA Emeryville'}
OPL={'id':'opl','name':'Oakland Library','url':'https://oaklandlibrary.bibliocommons.com/v2/events'}

def ikea_fixture():
    return {'id':'sample','location':{'store':{'storeNo':'sto165','city':'Emeryville'}},'price':{'amount':0},'visibilityState':'ACTIVE',
            'eventDetails':{'en':{'eventName':'Holiday cookie decorating','eventDescription':'For ages 12 and under. Children with an adult.'}},
            'registrationSettings':{'registrationRequired':True},'loyaltyEvent':'IKEA_FAMILY_ONLY',
            'timeSlots':[{'startDate':'2026-11-28T12:00:00','endDate':'2026-11-28T13:00:00','visibilityState':'ACTIVE'},
                         {'startDate':'2026-11-29T12:00:00','endDate':'2026-11-29T13:00:00','visibilityState':'ACTIVE'}]}

def ikea_html(item):
    return '<script type="text/hydrate">'+json.dumps({'events':[item]})+'</script>'

class CollectTests(unittest.TestCase):
    def test_ikea_multisession_ages_and_registration(self):
        events=parse_ikea(ikea_html(ikea_fixture()),IKEA)
        self.assertEqual([e['date'] for e in events],['2026-11-28','2026-11-29'])
        self.assertEqual((events[0]['min'],events[0]['max']),(0,12))
        self.assertNotEqual(events[0]['id'],events[1]['id'])
        self.assertIn('Family signup',events[0]['desc'])

    def test_wrong_store_does_not_leak_into_feed(self):
        item=ikea_fixture();item['location']['store']['storeNo']='sto999'
        with self.assertRaises(ValueError):parse_ikea(ikea_html(item),IKEA)

    def test_paid_ikea_is_excluded(self):
        item=ikea_fixture();item['price']['amount']=5
        self.assertEqual(parse_ikea(ikea_html(item),IKEA),[])

    def test_ikea_full_capacity_and_hidden_slot(self):
        item=ikea_fixture();item['timeSlots'][0].update(registrationSettings={'maxRegistrationCount':2},currentRegistrationCount=2)
        item['timeSlots'][1]['visibilityState']='CANCELLED'
        events=parse_ikea(ikea_html(item),IKEA)
        self.assertEqual(len(events),1);self.assertIn('Full',events[0]['status'])

    def test_missing_source_structure_fails_loudly(self):
        with self.assertRaises(ValueError):parse_ikea('<p>Blocked</p>',IKEA)
        with self.assertRaises(ValueError):parse_opl('<p>Blocked</p>',OPL)

    def test_schema_unknown_price_and_unknown_time_not_invented(self):
        obj={'name':'Kids craft','startDate':'2026-11-07T10:00:00-08:00','endDate':'2026-11-07T11:00:00-08:00',
             'url':'https://example.org/event','location':{'name':'Library','address':{'addressLocality':'Oakland','streetAddress':'1 Main'}}}
        source={'id':'funcheap','name':'Test source'}
        self.assertIsNone(parse_schema_event(obj,source))
        obj['offers']={'price':0};self.assertIsNotNone(parse_schema_event(obj,source))
        del obj['endDate'];self.assertIsNone(parse_schema_event(obj,source))

    def test_no_numeric_age_assumptions(self):
        self.assertEqual(ages('Family fun'),(None,None))
        self.assertEqual(ages('Ages 4–6'),(4,6))
        self.assertEqual(ages('Ages 4+'),(4,99))

    def test_failed_refresh_retains_recent_data_and_marks_stale(self):
        e=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0];e['checked_at']=(NOW-timedelta(days=8)).isoformat()
        merged=merge_events([e],[],[],NOW)
        self.assertEqual(len(merged),1);self.assertTrue(merged[0]['stale'])
        e['checked_at']=(NOW-timedelta(days=15)).isoformat()
        self.assertEqual(merge_events([e],[],[],NOW),[])

    def test_live_refresh_preserves_saved_card_id(self):
        e=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0];old=copy.deepcopy(e);old.update(id='ikea-cookies-28',source_id='curated',checked_at=NOW.isoformat())
        result=merge_events([], [old], [e],NOW)
        self.assertEqual(len(result),1);self.assertEqual(result[0]['id'],'ikea-cookies-28')
        self.assertEqual(result[0]['source_id'],'ikea')

    def test_explicit_cancellation_removes_previous_card(self):
        e=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0];e['checked_at']=NOW.isoformat()
        cancelled=copy.deepcopy(e);cancelled['cancelled']=True
        self.assertEqual(merge_events([e],[],[cancelled],NOW),[])

    def test_full_store_snapshot_removes_missing_sessions(self):
        events=parse_ikea(ikea_html(ikea_fixture()),IKEA)
        for e in events:e['checked_at']=NOW.isoformat()
        merged=merge_events(events,[],[events[0]],NOW,full_sources={'ikea'})
        self.assertEqual(len(merged),1)

    def test_unsafe_urls_rejected(self):
        e=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0];e['url']='javascript:alert(1)'
        with self.assertRaises(ValueError):validate_event(e)

    def test_ongoing_sorted_last(self):
        es=parse_ikea(ikea_html(ikea_fixture()),IKEA);e=copy.deepcopy(es[0]);e.update(id='ongoing',url='https://example.org/hunt/',date='2026-11-01',endDate='2026-12-31',ongoing=True)
        es.append(e);self.assertEqual(dedupe(es)[-1]['id'],'ongoing')

    def test_library_family_filter_and_cancellation(self):
        entities={'eventAudiences':{'kids':{'name':'Kids'},'adult':{'name':'Adults'}},'locations':{'x':{'name':'Library','address':{'city':'Oakland','number':'1','street':'Main'}}},'events':{}}
        for id,audience,cancelled in [('good','kids',False),('cancelled','kids',True),('adult','adult',False)]:
            entities['events'][id]={'id':id,'definition':{'title':'Craft','start':'2026-11-07T10:00','end':'2026-11-07T11:00','audienceIds':[audience],'branchLocationId':'x','isCancelled':cancelled}}
        html='<script data-iso-key="_0">'+json.dumps({'entities':entities})+'</script>'
        rows=parse_opl(html,OPL)
        self.assertEqual(len(rows),2)
        self.assertEqual(len([e for e in rows if not e.get('cancelled')]),1)

if __name__=='__main__':unittest.main()
