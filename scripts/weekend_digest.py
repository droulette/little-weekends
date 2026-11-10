"""Build a weekend email from the public feed; sending requires explicit --send."""
import argparse
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import json
import os
from pathlib import Path
import smtplib
import ssl
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from collect_events import allowed_library

PACIFIC = ZoneInfo('America/Los_Angeles')
SITE = 'https://droulette.github.io/little-weekends/'
ROOT = Path(__file__).resolve().parents[1]


def weekend(now):
    day = now.astimezone(PACIFIC).date()
    saturday = day + timedelta(days=(5-day.weekday()) % 7 if day.weekday()!=6 else -1)
    return saturday, saturday+timedelta(days=1)


def make_digest(feed, now):
    """Use the public feed only; private browser hides and plans are unavailable."""
    if not isinstance(feed,dict) or not isinstance(feed.get('events'),list):
        raise ValueError('Invalid event feed')
    try:
        generated = datetime.fromisoformat(feed['generated_at'].replace('Z','+00:00'))
        if generated.tzinfo is None or now-generated>timedelta(hours=48) or generated-now>timedelta(minutes=5):
            raise ValueError('Feed is stale or has an invalid timestamp')
    except (KeyError,AttributeError,TypeError) as exc:
        raise ValueError('Feed timestamp missing') from exc
    saturday,sunday=weekend(now)
    local=now.astimezone(PACIFIC)
    first=max(saturday,local.date()).isoformat()
    selected=[]
    for e in feed['events']:
        url=urlsplit(e.get('url',''))
        if (e.get('price')!='Free' or not allowed_library(e) or e.get('source_id')=='bn' or not e.get('date') or not e.get('start')
                or url.scheme not in ('http','https') or not url.hostname):
            continue
        if (e.get('endDate') or e['date'])<first or e['date']>sunday.isoformat():
            continue
        if (e.get('end') and not (e.get('endDate') and e.get('ongoing',True))
                and (e.get('endDate') or e['date'])==local.date().isoformat()
                and e['end']<=local.strftime('%H:%M')):
            continue
        selected.append(e)
    selected.sort(key=lambda e:(bool(e.get('ongoing',e.get('endDate'))),e['date'],e['start']))
    return saturday,sunday,selected


def message_for(feed, now):
    saturday,sunday,events=make_digest(feed,now)
    label=f'{saturday.strftime("%b %d")}–{sunday.strftime("%b %d")}'
    message=EmailMessage()
    message['Subject']=f'Little Weekends: {label}'
    lines=[f'Free family ideas for {label}', '', f'{len(events)} events found; showing up to 8. Times are Pacific.', '']
    failed=[s.get('name','Unknown source') for s in feed.get('sources',[]) if s.get('mode')=='automatic' and s.get('state')!='ok']
    if failed:lines.extend(['Some sources need attention: '+', '.join(failed), ''])
    for e in events[:8]:
        day=('Through '+e['endDate']) if e.get('endDate') else e['date']
        clock=e.get('hoursLabel') or ('Starts '+e['start'] if not e.get('end') else e['start']+'–'+e['end'])
        lines.extend([e['title'],f"{day} · {clock} · {e['venue']} · {e['city']}",
                      f"Organizer status: {e.get('status') or 'Check organizer'}",
                      f"Listing checked: {e.get('checked_at') or 'Not recorded'}",e['url'],''])
    if not events:lines.extend(['No matching events were found in this collection.',''])
    lines.extend(['Check the organizer for current details and registration.',
                  'Browser-only hidden events and personal plans are not reflected in this email.',
                  f'Open Little Weekends: {SITE}'])
    message.set_content('\n'.join(lines))
    return message


def deliver(message, environ=os.environ, smtp_factory=smtplib.SMTP_SSL):
    values={name:environ.get(name,'').strip() for name in ('SMTP_HOST','SMTP_USER','SMTP_PASSWORD','DIGEST_TO')}
    if not all(values.values()):
        raise ValueError('Mail settings are incomplete; check the repository secrets')
    # Header values are validated by EmailMessage; never print credentials.
    message['From']=values['SMTP_USER']
    message['To']=values['DIGEST_TO']
    with smtp_factory(values['SMTP_HOST'],465,timeout=30,context=ssl.create_default_context()) as smtp:
        smtp.login(values['SMTP_USER'],values['SMTP_PASSWORD'])
        smtp.send_message(message)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--feed',type=Path,default=ROOT/'site/data/events.json')
    parser.add_argument('--send',action='store_true',help='Send using configured SMTP secrets')
    args=parser.parse_args()
    message=message_for(json.loads(args.feed.read_text()),datetime.now(timezone.utc))
    if args.send:
        deliver(message)
        print('Weekend digest sent.')
    else:
        print(message.get_content())


if __name__=='__main__':
    main()
