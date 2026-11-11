"""Synthetic events and a fake SMTP client; tests never send email."""
import copy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from weekend_digest import deliver, make_digest, message_for, weekend, display_checked, display_event_time

NOW=datetime(2026,11,4,20,tzinfo=timezone.utc)
EVENT={'id':'craft','title':'Craft time','date':'2026-11-07','start':'10:00','end':'11:00',
       'city':'Oakland','venue':'Example venue','price':'Free','url':'https://example.org/event'}
FEED={'generated_at':NOW.isoformat(),'events':[EVENT],'sources':[]}


class DigestTests(unittest.TestCase):
    def test_excludes_standalone_donation_drives_but_keeps_activities(self):
        drive={**EVENT,'id':'drive','title':'Holiday Toy Drive at IKEA'}
        mixed={**EVENT,'id':'mixed','title':'Craft Workshop and Toy Drive'}
        ordinary={**EVENT,'id':'drive-in','title':'Drive-in Movie Night'}
        result=make_digest({**FEED,'events':[drive,mixed,ordinary]},NOW)[2]
        self.assertEqual([e['id'] for e in result],['mixed','drive-in'])

    def test_friendly_dates_and_pacific_timestamps(self):
        event={**EVENT,'checked_at':'2026-11-10T22:49:45.135620+00:00'}
        self.assertEqual(display_event_time(event),'Sat, Nov 7 · 10 am–11 am')
        self.assertEqual(display_checked(event['checked_at']),'Nov 10, 2:49 pm PT')
        self.assertEqual(display_checked(None),'Not recorded')
        self.assertEqual(display_checked('2026-11-10T22:49:45'),'Not recorded')
        self.assertEqual(display_checked('2026-07-10T22:49:45Z'),'Jul 10, 3:49 pm PT')
        ongoing={**event,'endDate':'2026-12-01','ongoing':True}
        self.assertEqual(display_event_time(ongoing),'Through Tue, Dec 1 · Check daily hours')
        overnight={**event,'endDate':'2026-11-08','ongoing':False,'start':'23:00','end':'01:30'}
        self.assertEqual(display_event_time(overnight),'Sat, Nov 7–Sun, Nov 8 · 11 pm–1:30 am')

    def test_weekend_selection_and_order(self):
        old={**EVENT,'id':'old','date':'2026-11-06'}
        paid={**EVENT,'id':'paid','price':'$10'}
        ongoing={**EVENT,'id':'ongoing','title':'Hunt','date':'2026-11-01','endDate':'2026-12-01','ongoing':True}
        invalid={**EVENT,'id':'unsafe','url':'javascript:alert(1)'}
        other_library={**EVENT,'id':'library','city':'San Leandro','venue':'Manor Branch, 1241 Manor Blvd.'}
        saturday,sunday,events=make_digest({**FEED,'events':[ongoing,old,paid,invalid,other_library,EVENT]},NOW)
        self.assertEqual((saturday.isoformat(),sunday.isoformat()),('2026-11-07','2026-11-08'))
        self.assertEqual([e['id'] for e in events],['craft','ongoing'])

    def test_sunday_removes_saturday_and_finished_events(self):
        now=datetime(2026,11,8,20,tzinfo=timezone.utc)
        finished={**EVENT,'id':'ended','date':'2026-11-08','start':'09:00','end':'10:00'}
        upcoming={**EVENT,'id':'later','date':'2026-11-08','start':'14:00','end':'15:00'}
        feed={**FEED,'generated_at':now.isoformat(),'events':[EVENT,finished,upcoming]}
        self.assertEqual([e['id'] for e in make_digest(feed,now)[2]],['later'])

    def test_rejects_stale_feed_and_reports_failed_source(self):
        with self.assertRaises(ValueError):make_digest(FEED,datetime(2026,11,8,tzinfo=timezone.utc))
        feed={**FEED,'sources':[{'name':'Example source','mode':'automatic','state':'error'}]}
        self.assertIn('Some sources need attention: Example source',message_for(feed,NOW).get_content())

    def test_send_requires_secrets_and_uses_secure_smtp(self):
        message=message_for(FEED,NOW)
        with self.assertRaises(ValueError):deliver(message,{})
        calls=[]
        class FakeSMTP:
            def __init__(self,host,port,**kwargs):calls.append(('connect',host,port,bool(kwargs.get('context'))))
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def login(self,user,password):calls.append(('login',user,password))
            def send_message(self,msg):calls.append(('send',msg['To'],msg.get_content()))
        deliver(message,{'SMTP_HOST':'smtp.example.org','SMTP_USER':'sender@example.org','SMTP_PASSWORD':'test-secret','DIGEST_TO':'me@example.org'},FakeSMTP)
        self.assertEqual(calls[0],('connect','smtp.example.org',465,True))
        self.assertEqual(calls[-1][0:2],('send','me@example.org'))
        self.assertIn('Craft time',calls[-1][2])


if __name__=='__main__':unittest.main()
