"""Synthetic events and a fake SMTP client; tests never send email."""
import copy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from weekend_digest import deliver, make_digest, message_for, weekend

NOW=datetime(2026,11,4,20,tzinfo=timezone.utc)
EVENT={'id':'craft','title':'Craft time','date':'2026-11-07','start':'10:00','end':'11:00',
       'city':'Oakland','venue':'Example venue','price':'Free','url':'https://example.org/event'}
FEED={'generated_at':NOW.isoformat(),'events':[EVENT],'sources':[]}


class DigestTests(unittest.TestCase):
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
