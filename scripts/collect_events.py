"""Collect public East Bay listings; no login, LLM key, or database required.

Only explicitly free events with a confirmed city/date are imported. Unknown
ages stay unknown. Source failures are visible and never erase the last feed.
"""
from __future__ import annotations
import argparse
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html import unescape
import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'site' / 'data'
PACIFIC = ZoneInfo('America/Los_Angeles')
CITIES = {'Oakland', 'Emeryville', 'Berkeley', 'Albany', 'Alameda', 'El Cerrito', 'San Leandro', 'Castro Valley'}
FAMILY = re.compile(r'\b(kids?|child(?:ren)?|famil(?:y|ies)|story\s?time|preschool|toddler|puppet|lego|scavenger|ornament|cookie decorat|pumpkin keychain|photo frame|holiday craft)\b', re.I)
ADULT = re.compile(r'\b(21\+|18\+|adults? only|adult-only|happy hour|nightclub|beer tasting|wine tasting|comedy night)\b', re.I)
SOURCES = [
 {'id':'ikea','name':'IKEA Emeryville','url':'https://www.ikea.com/us/en/stores/emeryville/','mode':'automatic'},
 {'id':'opl','name':'Oakland & Temescal libraries','url':'https://oaklandlibrary.bibliocommons.com/v2/events','mode':'automatic'},
 {'id':'510','name':'510 Families','url':'https://www.510families.com/calendar/','mode':'automatic'},
 {'id':'funcheap','name':'SF Funcheap · East Bay','url':'https://sf.funcheap.com/region/east-bay/','mode':'automatic'},
 {'id':'bn','name':'Barnes & Noble · Emeryville','url':'https://stores.barnesandnoble.com/store/2072','mode':'manual','note':'Local calendar needs manual checking; no working importer yet.'},
 {'id':'homedepot','name':'Home Depot · Emeryville','url':'https://www.homedepot.com/c/kids-workshop','mode':'manual','note':'Starter dates only; confirm local registration.'},
 {'id':'michaels','name':'Michaels · East Bay Bridge, Emeryville','url':'https://locations.michaels.com/CA/EMERYVILLE/1538','mode':'manual','note':'National starter dates only; confirm store 1538.'},
 {'id':'sanleandro','name':'Downtown San Leandro','url':'https://downtownsanleandro.com/special-events/','mode':'manual','note':'Festival calendar; current dates are hand-checked.'},
 {'id':'castrovalley','name':'Castro Valley / Eden Area Chamber','url':'https://business.edenareachamber.com/events/','mode':'manual','note':'Festival calendar; current dates are hand-checked.'},
]


def clean(value):
    return ' '.join(BeautifulSoup(unescape(str(value or '')), 'html.parser').get_text(' ', strip=True).split())


def canonical(url):
    u = urlparse(str(url))
    if u.scheme not in ('http', 'https') or not u.hostname:
        raise ValueError('Invalid source URL')
    return urlunparse((u.scheme, u.netloc, u.path.rstrip('/'), '', '', ''))


def walk(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def jsonld(soup):
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            for obj in walk(json.loads(tag.get_text())):
                types = obj.get('@type', [])
                if isinstance(types, str):
                    types = [types]
                if 'Event' in types:
                    yield obj
        except (ValueError, TypeError):
            continue


def ages(text):
    text = clean(text)
    m = re.search(r'ages?\s*(\d{1,2})\s*(?:-|–|through|to)\s*(\d{1,2})', text, re.I)
    if m:
        return int(m[1]), int(m[2])
    m = re.search(r'ages?\s*(\d{1,2})\s*(?:\+|and (?:up|older))', text, re.I)
    if m:
        return int(m[1]), 99
    m = re.search(r'(?:ages?\s*)?(\d{1,2})\s*(?:and|&)\s*under', text, re.I)
    if m:
        return 0, int(m[1])
    return (0, 99) if re.search(r'\ball ages\b', text, re.I) else (None, None)


def category(title):
    if re.search(r'festival|parade|celebrat|fair\b|night market', title, re.I):
        return 'Celebrations', '🎉', '#f0e3ca'
    if re.search(r'build|lego|engineer', title, re.I):
        return 'Building', '🛠️', '#efdfc9'
    if re.search(r'craft|art|paint|clay|ornament|decorat|keychain', title, re.I):
        return 'Art & crafts', '🎨', '#e6e9db'
    return 'Stories & play', '🧸', '#dce8dd'


def local_datetime(value):
    dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return dt.astimezone(PACIFIC) if dt.tzinfo else dt.replace(tzinfo=PACIFIC)


def make_event(source, title, start, end, city, venue, url, description, *, status='Check organizer', min_age=None, max_age=None):
    st, en = local_datetime(start), local_datetime(end)
    if en <= st or city not in CITIES:
        raise ValueError('Invalid time or unsupported city')
    title, description = clean(title), clean(description)
    if not title:
        raise ValueError('Missing title')
    cat, icon, color = category(title)
    key = canonical(url) + '|' + st.isoformat()
    result = dict(id='event-'+sha256(key.encode()).hexdigest()[:18], title=title[:180], date=st.date().isoformat(),
                  start=st.strftime('%H:%M'), end=en.strftime('%H:%M'), city=city, venue=clean(venue)[:220],
                  price='Free', min=min_age, max=max_age, cat=cat, icon=icon, color=color, source=source['name'],
                  source_id=source['id'], status=status, url=canonical(url)+'/', desc=description[:600])
    if st.date() != en.date():
        result['endDate'] = en.date().isoformat()
        result['ongoing'] = (en.date()-st.date()).days > 1
        result['hoursLabel'] = 'Check daily hours' if result['ongoing'] else st.strftime('%H:%M')+'–'+en.strftime('%H:%M')+' · multiple dates'
    validate_event(result)
    return result


def validate_event(e):
    for key in ['id', 'title', 'date', 'start', 'end', 'city', 'venue', 'price', 'url', 'source_id']:
        if not isinstance(e.get(key), str) or not e[key]:
            raise ValueError('Missing/invalid '+key)
    date.fromisoformat(e['date'])
    datetime.strptime(e['start'], '%H:%M')
    datetime.strptime(e['end'], '%H:%M')
    if e.get('endDate'):
        if date.fromisoformat(e['endDate']) < date.fromisoformat(e['date']):
            raise ValueError('End date before start')
    elif e['end'] <= e['start']:
        raise ValueError('End time before start')
    if e['city'] not in CITIES:
        raise ValueError('Unsupported city')
    canonical(e['url'])
    for key in ['min', 'max']:
        if e.get(key) is not None and (type(e[key]) is not int or not 0 <= e[key] <= 99):
            raise ValueError('Invalid age')
    if (e.get('min') is None) != (e.get('max') is None):
        raise ValueError('Both age bounds required')
    if e.get('min') is not None and e['min'] > e['max']:
        raise ValueError('Reversed ages')


class PublicClient:
    """Bounded public requests, robots compliance, no auth/cookies persisted."""
    def __init__(self):
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'LittleWeekends/1.0 (personal East Bay family event calendar)'
        self.robots = {}
        self.last_request = {}
        self.cache = {}

    def get(self, url):
        if url in self.cache:
            return self.cache[url]
        host = urlparse(url).netloc
        origin = f'{urlparse(url).scheme}://{host}'
        if host not in self.robots:
            response = self.session.get(origin+'/robots.txt', timeout=(10, 20))
            if response.status_code == 404:
                text = 'User-agent: *\nAllow: /'
            else:
                response.raise_for_status()
                text = response.text
            rp = RobotFileParser()
            rp.parse(text.splitlines())
            self.robots[host] = rp
        rp = self.robots[host]
        if not rp.can_fetch('LittleWeekends', url):
            raise RuntimeError('Source disallows automated access to this URL')
        interval = max(0.4, rp.crawl_delay('LittleWeekends') or rp.crawl_delay('*') or 0)
        if interval > 10:
            raise RuntimeError('Source requests a slower crawl; manual check needed')
        time.sleep(max(0, interval - (time.monotonic()-self.last_request.get(host, 0))))
        self.last_request[host] = time.monotonic()
        response = self.session.get(url, timeout=(10, 25))
        response.raise_for_status()
        if len(response.content) > 5_000_000:
            raise ValueError('Unexpectedly large source page')
        self.cache[url] = response.text
        return response.text


def parse_ikea(html, source):
    found, rows = {}, []
    for script in BeautifulSoup(html, 'html.parser').select('script[type="text/hydrate"]'):
        try:
            data = json.loads(script.get_text())
        except ValueError:
            continue
        for item in walk(data):
            if item.get('eventDetails') and item.get('timeSlots') and item.get('id'):
                store = item.get('location', {}).get('store', {})
                if store.get('storeNo') == 'sto165' and store.get('city') == 'Emeryville':
                    found[item['id']] = item
    if not found:
        raise ValueError('IKEA event data missing or page structure changed')
    for item in found.values():
        if item.get('price', {}).get('amount') != 0 or item.get('visibilityState') != 'ACTIVE':
            continue
        details = item['eventDetails'].get('en', {})
        title = details.get('eventName', '')
        description = clean(details.get('eventDescription') or details.get('eventIntroduction'))
        if not FAMILY.search(title+' '+description) or ADULT.search(title+' '+description):
            continue
        # Giveaways alone aren't an activity to plan a family outing around.
        if re.search('giveaway', title, re.I):
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
        url = f'https://www.ikea.com/us/en/stores/events/ikea-emeryville-ca/{slug}--{item["id"]}/'
        registration = item.get('registrationSettings', {}).get('registrationRequired', False)
        note = ('IKEA Family signup required. ' if item.get('loyaltyEvent') == 'IKEA_FAMILY_ONLY' else '')
        lo, hi = ages(description)
        for slot in item['timeSlots']:
            if slot.get('visibilityState', 'ACTIVE') != 'ACTIVE':
                continue
            status = 'Registration required' if registration else 'No registration required'
            cap = slot.get('registrationSettings', {}).get('maxRegistrationCount')
            if slot.get('registrationClosed'):
                status = 'Registration closed'
            elif registration and cap and slot.get('currentRegistrationCount', 0) >= cap:
                status = 'Full · check waitlist'
            rows.append(make_event(source, title, slot['startDate'], slot['endDate'], 'Emeryville',
                                   'IKEA Emeryville · 4400 Shellmound St', url, note+description,
                                   status=status, min_age=lo, max_age=hi))
    return rows


def parse_opl(html, source):
    soup = BeautifulSoup(html, 'html.parser')
    tag = soup.find('script', {'data-iso-key':'_0'})
    if tag is None:
        raise ValueError('Library structured data missing')
    entities = json.loads(tag.get_text())['entities']
    if 'events' not in entities:
        raise ValueError('Library event data missing')
    rows = []
    for event in entities['events'].values():
        d = event.get('definition', {})
        audience = [entities.get('eventAudiences', {}).get(k, {}).get('name', '') for k in d.get('audienceIds', [])]
        if not set(audience).intersection({'Kids','Families','Grade Schoolers','Preschoolers','Birth to 5','Toddlers'}):
            continue
        location = entities.get('locations', {}).get(d.get('branchLocationId'), {})
        address = location.get('address', {})
        city = address.get('city')
        if city not in CITIES:
            continue
        desc = clean(d.get('description'))
        if ADULT.search(d.get('title','')+' '+desc):
            continue
        lo, hi = ages(desc)
        registration = d.get('registrationInfo') or {}
        status = 'Check organizer'
        if registration.get('provider') and registration.get('provider') != 'NONE':
            status = 'Registration required'
        if event.get('isFull'):
            status = 'Full · check waitlist'
        if event.get('registrationClosed'):
            status = 'Registration closed'
        venue = location.get('name', 'Oakland Public Library')+' · '+(clean(d.get('locationDetails')) or ' '.join(str(address.get(k, '')) for k in ['number','street']))
        row = make_event(source, d['title'], d['start'], d['end'], city, venue,
                         source['url']+'/'+event['id'], desc, status=status, min_age=lo, max_age=hi)
        row['cancelled'] = bool(d.get('isCancelled'))
        rows.append(row)
    return rows


def parse_schema_event(obj, source, soup=None):
    if str(obj.get('eventStatus','')).endswith('EventCancelled'):
        return None
    offers = obj.get('offers') or []
    if isinstance(offers, dict):
        offers = [offers]
    free = obj.get('isAccessibleForFree') is True or any(str(o.get('price')) in ('0','0.0','0.00') for o in offers)
    if soup is not None and source['id'] == '510':
        ticket = soup.select_one('.fa-ticket')
        cost = clean(ticket.parent.get_text()) if ticket else ''
        # "kids free, adults $10" and "free with purchase" are not free admission.
        free = bool(re.fullmatch(r'free(?:\s+admission)?[.!]?', cost, re.I))
    if not free:
        return None
    location = obj.get('location') or {}
    if not isinstance(location, dict):
        return None
    address = location.get('address') or {}
    if not isinstance(address, dict):
        return None
    city = address.get('addressLocality')
    title = clean(obj.get('name'))
    desc = clean(obj.get('description'))
    text = title+' '+desc
    if soup is not None:
        content = soup.select_one('.em-event-content, .entry-content, article')
        if content:
            text += ' '+clean(content.get_text())
    if city not in CITIES or ADULT.search(text):
        return None
    if source['id'] != '510' and not FAMILY.search(text):
        return None
    start, end = obj.get('startDate'), obj.get('endDate')
    if not start or not end or 'T' not in start or 'T' not in end:
        return None  # Never invent event times.
    lo, hi = ages(desc)
    venue = clean(location.get('name'))+' · '+clean(address.get('streetAddress'))
    return make_event(source, title, start, end, city, venue, obj['url'], desc, min_age=lo, max_age=hi)


def collect_510(client, source, pages, max_details):
    links = []
    for page in range(1, pages+1):
        url = source['url'] + (f'?pno={page}' if page > 1 else '')
        soup = BeautifulSoup(client.get(url), 'html.parser')
        found = soup.select('.em-item-title a[href]')
        if not found:
            raise ValueError('510 Families event list missing')
        links.extend(a['href'] for a in found)
    rows, failures, attempted = [], 0, 0
    for url in dict.fromkeys(links):
        if attempted >= max_details:
            break
        if urlparse(url).netloc != urlparse(source['url']).netloc:
            continue
        attempted += 1
        try:
            soup = BeautifulSoup(client.get(url), 'html.parser')
            for obj in jsonld(soup):
                event = parse_schema_event(obj, source, soup)
                if event:
                    rows.append(event)
        except (requests.RequestException, ValueError, KeyError) as exc:
            failures += 1
            logging.warning('510 detail skipped: %s', type(exc).__name__)
    if failures == attempted and attempted:
        raise ValueError('All event detail requests failed')
    return rows, f'Checked {attempted} event pages; {failures} failed. Bounded sample, not the full calendar.'


def collect_funcheap(client, source, pages, max_details):
    soup = BeautifulSoup(client.get(source['url']), 'html.parser')
    objects = list(jsonld(soup))
    if not objects:
        raise ValueError('Funcheap event data missing')
    rows = []
    for obj in objects[:max_details]:
        # Many listing entries omit venue/address. Only inspect family candidates.
        if not FAMILY.search(clean(obj.get('name'))) or ADULT.search(clean(obj.get('name'))):
            continue
        url = obj.get('url','')
        if urlparse(url).netloc != 'sf.funcheap.com':
            continue
        detail = BeautifulSoup(client.get(url), 'html.parser')
        for full in jsonld(detail):
            event = parse_schema_event(full, source, detail)
            if event:
                rows.append(event)
    return rows, 'Family-keyword candidates only; events without a structured local address are skipped.'


def load_json(path, fallback):
    return json.loads(path.read_text()) if path.exists() else fallback


def dedupe(events):
    """Prefer live official sources, but retain old IDs when refreshing a card."""
    priority = {'ikea':0,'opl':0,'curated':2,'510':3,'funcheap':4}
    output, seen = [], set()
    for e in sorted(events, key=lambda x: (priority.get(x['source_id'], 5), -datetime.fromisoformat(x.get('checked_at','2000-01-01T00:00:00Z').replace('Z','+00:00')).timestamp())):
        key = (canonical(e['url']), e['date'], e['start'])
        title_key = (re.sub(r'[^a-z0-9]', '', e['title'].lower()), e['date'], e['start'], e['city'])
        if key in seen or title_key in seen:
            continue
        seen.update((key, title_key))
        output.append(e)
    return sorted(output, key=lambda e: (bool(e.get('ongoing', e.get('endDate'))), e['date'], e['start'], e['title']))


def merge_events(previous, curated, fresh, now, full_sources=()):
    today = now.astimezone(PACIFIC).date().isoformat()
    identity = {(canonical(e['url']),e['date'],e['start']):e['id'] for e in curated+previous}
    live_opl_urls = {canonical(e['url']) for e in fresh if e['source_id'] == 'opl'}
    cancelled = {(canonical(e['url']),e['date']) for e in fresh if e.get('cancelled')}
    by_id = {e['id']:dict(e) for e in previous if e.get('source_id') != 'curated'
             and e.get('source_id') not in full_sources
             and canonical(e['url']) not in live_opl_urls}
    for event in fresh:
        event = dict(event)
        key = (canonical(event['url']),event['date'],event['start'])
        event['id'] = identity.get(key,event['id'])
        if event.get('cancelled'):
            continue
        event['checked_at'] = now.isoformat()
        event.pop('stale',None)
        by_id[event['id']] = event
    pool = []
    for event in list(by_id.values())+curated:
        event = dict(event)
        if (canonical(event['url']),event['date']) in cancelled:
            continue
        if event['source_id']=='curated' and 'ikea' in full_sources and 'ikea.com/us/en/stores/events/ikea-emeryville-ca/' in event['url']:
            continue
        validate_event(event)
        if (event.get('endDate') or event['date']) < today:
            continue
        checked = datetime.fromisoformat(event.get('checked_at','2000-01-01T00:00:00Z').replace('Z','+00:00'))
        event['stale'] = now-checked > timedelta(days=7)
        if event['source_id'] != 'curated' and now-checked > timedelta(days=14):
            continue
        # Do not retain duplicate, manually seeded IKEA/OPL dates after live refresh.
        if event['source_id'] == 'curated' and any(canonical(e['url']) == canonical(event['url']) and e['source_id'] in {'ikea','opl'} for e in fresh):
            continue
        pool.append(event)
    return dedupe(pool)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', nargs='*', default=['ikea','opl','510','funcheap'])
    parser.add_argument('--pages', type=int, default=4)
    parser.add_argument('--max-details', type=int, default=90)
    parser.add_argument('--output', type=Path, default=DATA/'events.json')
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    client = PublicClient()
    previous = load_json(args.output, {})
    prior_status = {s['id']:s for s in previous.get('sources',[])}
    fresh, statuses, successes = [], [], 0
    for source in SOURCES:
        status = dict(source)
        prior = prior_status.get(source['id'],{})
        status['last_success'] = prior.get('last_success')
        if source['mode'] == 'manual':
            status['state'] = 'manual'
        elif source['id'] not in args.sources:
            status.update(state='not_run', note='Not collected in this run.')
        else:
            status['last_attempt'] = now.isoformat()
            try:
                if source['id'] == 'ikea':
                    rows = parse_ikea(client.get(source['url']), source)
                    note = 'Official Emeryville store data; only free family activities.'
                elif source['id'] == 'opl':
                    rows = []
                    for page in range(1,args.pages+1):
                        rows += parse_opl(client.get(source['url']+(f'?page={page}' if page>1 else '')),source)
                    note = f'First {args.pages} calendar pages; children/family audiences only.'
                elif source['id'] == '510':
                    rows,note = collect_510(client,source,args.pages,args.max_details)
                else:
                    rows,note = collect_funcheap(client,source,args.pages,args.max_details)
                for e in rows:
                    validate_event(e)
                fresh += rows
                status.update(state='ok', count=len(rows), last_success=now.isoformat(), note=note)
                successes += 1
            except Exception as exc:
                logging.exception('Source failed: %s',source['id'])
                status.update(state='error', note=f'Could not refresh ({type(exc).__name__}); retained recent listings. Check the source directly.')
        statuses.append(status)
        print(f'{source["id"]}: {status["state"]} ({status.get("count",0)} events)',flush=True)
    curated = load_json(DATA/'curated.json', [])
    merged = merge_events(previous.get('events', []),curated,fresh,now, full_sources={s['id'] for s in statuses if s['id']=='ikea' and s['state']=='ok'})
    result = dict(schema_version=1, generated_at=now.isoformat(), last_successful_collection=now.isoformat() if successes else previous.get('last_successful_collection'),
                  sources=statuses, events=merged, note='Public, free family listings. Collection is bounded and may miss events. Check organizer details before attending.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(args.output)
    print(f'Published {len(merged)} upcoming listings; {successes} sources refreshed.')
    return 0 if successes else 1


if __name__ == '__main__':
    raise SystemExit(main())
