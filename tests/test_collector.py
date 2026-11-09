"""Small synthetic fixtures: exercise failure modes, not third-party snapshots."""
import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect_events import parse_ikea, parse_opl, parse_schema_event, ages, merge_events, dedupe, validate_event, parse_bn, parse_alamedakids, library_page_url

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

    def test_verified_alias_preserves_saved_id_and_deduplicates(self):
        fresh=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0]
        old=copy.deepcopy(fresh)
        old.update(id='saved-card',source_id='curated',url='https://example.org/official/',
                   also_listed_at=[fresh['url']],checked_at=NOW.isoformat())
        result=merge_events([], [old], [fresh],NOW)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['id'],'saved-card')
        # A later session at the same URL remains a separate outing.
        later=copy.deepcopy(fresh);later.update(id='later',start='16:00',end='17:00')
        self.assertEqual(len(merge_events([], [old], [fresh,later],NOW)),2)

    def test_explicit_cancellation_removes_previous_card(self):
        e=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0];e['checked_at']=NOW.isoformat()
        cancelled=copy.deepcopy(e);cancelled['cancelled']=True
        self.assertEqual(merge_events([e],[],[cancelled],NOW),[])

    def test_full_store_snapshot_removes_missing_sessions(self):
        events=parse_ikea(ikea_html(ikea_fixture()),IKEA)
        for e in events:e['checked_at']=NOW.isoformat()
        merged=merge_events(events,[],[events[0]],NOW,full_sources={'ikea'})
        self.assertEqual(len(merged),1)

    def test_bn_start_only_and_store_filter(self):
        def row(id,store):
            return dict(eventId=id,storeId=store,name='Storytime',isStoryTime=True,isInstoreEvent=True,isVirtualEvent=False,
                        date='2026-11-07',time24='14:00',storeAddress1='5604 Bay Street',descriptionText='Storytime in the Kids Department')
        data={'content':[row('local',2072),row('other',9005)]}
        script='self.__next_f.push('+json.dumps([1,'a:'+json.dumps(data)])+')'
        events=parse_bn('<script>'+script+'</script>',{'id':'bn','name':'Barnes & Noble Emeryville'})
        self.assertEqual(len(events),1);self.assertEqual(events[0]['start'],'14:00');self.assertIsNone(events[0]['end'])

    def test_local_calendar_excludes_paid_and_out_of_area(self):
        def row(city,cost,title):
            return f'<tr><td><span class="date-display-single" content="2026-11-14T00:00:00-08:00"></span></td><td><a aria-controls="event">{title}</a><div class="collapse"><p>Fun for kids.</p><p>Time: 3PM – 4PM</p><p>Cost: {cost}</p><p>Location: Library, Main Street, {city}</p><p>Link: More</p><a href="/event">Click here for complete event details</a></div></td></tr>'
        html='<table class="views-table">'+row('Castro Valley','Free','Kids craft')+row('Castro Valley','$5','Paid kids craft')+row('Fremont','Free','Faraway kids craft')+'</table>'
        events=parse_alamedakids(html,{'id':'alamedakids','name':'Alameda Kids','url':'https://www.alamedakids.org/calendar'})
        self.assertEqual(len(events),1);self.assertEqual(events[0]['start'],'15:00')

    def test_library_pagination_preserves_branch_filter(self):
        url='https://oaklandlibrary.bibliocommons.com/v2/events?locations=TMA'
        self.assertEqual(library_page_url(url,1),url)
        self.assertEqual(library_page_url(url,2),url+'&page=2')
        self.assertEqual(library_page_url(OPL['url'],2),OPL['url']+'?page=2')
        data={'entities':{'eventAudiences':{'kids':{'name':'Kids'}},
            'locations':{'t':{'name':'Temescal Branch','address':{'city':'Oakland','number':'5205','street':'Telegraph'}},
                         'r':{'name':'Rockridge Branch','address':{'city':'Oakland'}}},'events':{}}}
        for branch in ['t','r']:
            data['entities']['events'][branch]={'id':branch,'definition':{'title':'Family craft','start':'2026-12-05T11:00',
                'end':'2026-12-05T12:30','audienceIds':['kids'],'branchLocationId':branch}}
        rows=parse_opl('<script data-iso-key="_0">'+json.dumps(data)+'</script>',dict(OPL,url=url))
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['url'],OPL['url']+'/t/')

    def test_duplicate_sources_keep_provenance_and_saved_ids(self):
        official = parse_ikea(ikea_html(ikea_fixture()), IKEA)[0]
        official['checked_at'] = NOW.isoformat()
        calendar = dict(official, id='saved-calendar-card', source_id='510', source='510 Families',
                        url='https://example.org/cookie-decorating/')
        result = dedupe([calendar, official])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['source_id'], 'ikea')
        self.assertIn('saved-calendar-card', result[0]['alternate_ids'])
        self.assertEqual({item['source_id'] for item in result[0]['listings']}, {'ikea', '510'})
        # Future runs keep the secondary URL and saved ID, even if that source fails.
        refreshed = merge_events(result, [], [official], NOW)
        self.assertIn('saved-calendar-card', refreshed[0]['alternate_ids'])
        self.assertEqual(len(refreshed[0]['listings']), 2)
        self.assertEqual(dedupe(refreshed), refreshed)

    def test_refreshing_both_duplicate_sources_keeps_official_details(self):
        official = parse_ikea(ikea_html(ikea_fixture()), IKEA)[0]
        official['checked_at'] = NOW.isoformat()
        calendar = dict(official, id='calendar-id', source_id='510', source='510 Families',
                        url='https://example.org/same-session/')
        previous = dedupe([calendar, official])
        # Identity aliases resolve both fresh sources to the same saved ID.
        refreshed = merge_events(previous, [], [official, calendar], NOW, full_sources={'ikea'})
        self.assertEqual(len(refreshed), 1)
        self.assertEqual(refreshed[0]['source_id'], 'ikea')
        self.assertIn('calendar-id', refreshed[0]['alternate_ids'])
        self.assertEqual(len(refreshed[0]['listings']), 2)

    def test_same_title_at_different_venues_or_sessions_stays_separate(self):
        base = parse_ikea(ikea_html(ikea_fixture()), IKEA)[0]
        other = dict(base, id='other-place', venue='Another venue', source_id='510',
                     url='https://example.org/another-venue/')
        later = dict(base, id='later', start='16:00', end='17:00')
        self.assertEqual(len(dedupe([base, other, later])), 3)
        # Missing venues cannot establish an exact venue match.
        left = dict(base, venue='')
        right = dict(other, venue='')
        self.assertEqual(len(dedupe([left, right])), 2)

    def test_verified_alias_bridges_group_without_losing_provenance(self):
        base = parse_ikea(ikea_html(ikea_fixture()), IKEA)[0]
        one = dict(base, id='one', source_id='510', source='510 Families', url='https://example.org/one/', title='Calendar title')
        two = dict(base, id='two', source_id='alamedakids', source='Alameda Kids', url='https://example.org/two/', title='Other title')
        bridge = dict(base, also_listed_at=[one['url'], two['url']])
        result = dedupe([one, two, bridge])
        self.assertEqual(len(result), 1)
        self.assertEqual(set(result[0]['alternate_ids']), {'one', 'two'})
        self.assertEqual(len(result[0]['listings']), 3)

    def test_unsafe_provenance_rejected(self):
        base = parse_ikea(ikea_html(ikea_fixture()), IKEA)[0]
        base['listings'] = [dict(source_id='test', source='Test', url='javascript:alert(1)')]
        with self.assertRaises(ValueError): validate_event(base)
        base.pop('listings')
        base['alternate_ids'] = [123]
        with self.assertRaises(ValueError): validate_event(base)

    def test_unsafe_urls_rejected(self):
        e=parse_ikea(ikea_html(ikea_fixture()),IKEA)[0];e['url']='javascript:alert(1)'
        with self.assertRaises(ValueError):validate_event(e)

    def test_ongoing_sorted_last(self):
        es=parse_ikea(ikea_html(ikea_fixture()),IKEA);e=copy.deepcopy(es[0]);e.update(id='ongoing',url='https://example.org/hunt/',date='2026-11-01',endDate='2026-12-31',ongoing=True)
        es.append(e);self.assertEqual(dedupe(es)[-1]['id'],'ongoing')

    def test_library_family_filter_and_cancellation(self):
        entities={'eventAudiences':{'kids':{'name':'Kids'},'adult':{'name':'Adults'}},'locations':{'x':{'name':'Temescal Branch','address':{'city':'Oakland','number':'1','street':'Main'}}},'events':{}}
        for id,audience,cancelled in [('good','kids',False),('cancelled','kids',True),('adult','adult',False)]:
            entities['events'][id]={'id':id,'definition':{'title':'Craft','start':'2026-11-07T10:00','end':'2026-11-07T11:00','audienceIds':[audience],'branchLocationId':'x','isCancelled':cancelled}}
        html='<script data-iso-key="_0">'+json.dumps({'entities':entities})+'</script>'
        rows=parse_opl(html,OPL)
        self.assertEqual(len(rows),2)
        self.assertEqual(len([e for e in rows if not e.get('cancelled')]),1)

if __name__=='__main__':unittest.main()
