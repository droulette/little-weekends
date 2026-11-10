"""Collect public East Bay listings; no login, LLM key, or database required.

Only explicitly free events with a confirmed city/date are imported. Unknown
ages stay unknown. Source failures are visible and never erase the last feed.
"""
from __future__ import annotations
import argparse
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html import unescape
import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import unquote_plus, urljoin, urlparse, urlunparse
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
 {'id':'opl','name':'Temescal Branch Library','url':'https://oaklandlibrary.bibliocommons.com/v2/events?locations=TMA','mode':'automatic'},
 {'id':'alamedakids','name':'Alameda Kids · free family events','url':'https://www.alamedakids.org/calendar','mode':'automatic'},
 {'id':'510','name':'510 Families · RSS guides','url':'https://www.510families.com/feed/','mode':'automatic','kind':'articles'},
 {'id':'funcheap','name':'SF Funcheap · East Bay','url':'https://sf.funcheap.com/region/east-bay/','mode':'automatic'},
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
    # Drop only well-known marketing parameters for matching. Keep the actual
    # event URL untouched and preserve all other query values, including IDs.
    tracking={'fbclid','gclid','dclid','msclkid','mc_cid','mc_eid','_ga','_gl','igshid'}
    parts=[]
    for part in u.query.split('&'):
        name=unquote_plus(part.split('=',1)[0]).lower()
        if part and not (name.startswith('utm_') or name in tracking):
            parts.append(part)
    return urlunparse((u.scheme, u.netloc, u.path.rstrip('/'), '', '&'.join(parts), ''))


# Known Oakland Public Library branch names without the word "library".
# Source: https://oaklandlibrary.org/faqs/ and the OPL location directory.
OPL_BRANCH = re.compile(r'\b(?:81st Avenue|Asian|Brookfield|(?:C[eé]sar(?:\s+E\.)?\s+)?Ch[aá]vez|Dimond|Eastmont|Elmhurst|Fruitvale|Golden Gate|Lakeview|Martin (?:Luther |L\. )?King(?:,?\s*Jr\.?)?|Melrose|Montclair|Piedmont(?: Avenue)?|Rockridge|Temescal|West Oakland)\s+Branch\b', re.I)


def allowed_library(event):
    venue=str(event.get('venue') or '')
    source=str(event.get('source') or '')
    host=(urlparse(str(event.get('url') or '')).hostname or '').lower()
    is_library=(bool(re.search(r'\blibrar(?:y|ies)\b',venue+' '+source,re.I))
                or bool(OPL_BRANCH.search(venue)) or event.get('source_id')=='opl'
                or host.endswith('.bibliocommons.com') or host.endswith('.libnet.info'))
    return not is_library or bool(re.search(r'\bTemescal\b',venue,re.I))


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
    m = re.search(r'ages?\s*:?\s*(\d{1,2})\s*(?:-|–|through|to)\s*(\d{1,2})', text, re.I)
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
    st, en = local_datetime(start), local_datetime(end) if end else None
    if (en is not None and en <= st) or city not in CITIES:
        raise ValueError('Invalid time or unsupported city')
    title, description = clean(title), clean(description)
    if not title:
        raise ValueError('Missing title')
    cat, icon, color = category(title)
    key = canonical(url) + '|' + st.isoformat()
    result = dict(id='event-'+sha256(key.encode()).hexdigest()[:18], title=title[:180], date=st.date().isoformat(),
                  start=st.strftime('%H:%M'), end=en.strftime('%H:%M') if en else None, city=city, venue=clean(venue)[:220],
                  price='Free', min=min_age, max=max_age, cat=cat, icon=icon, color=color, source=source['name'],
                  source_id=source['id'], status=status, url=str(url), desc=description[:600])
    if en is not None and st.date() != en.date():
        result['endDate'] = en.date().isoformat()
        result['ongoing'] = (en.date()-st.date()).days > 1
        result['hoursLabel'] = 'Check daily hours' if result['ongoing'] else st.strftime('%H:%M')+'–'+en.strftime('%H:%M')+' · multiple dates'
    validate_event(result)
    return result


def validate_event(e):
    for key in ['id', 'title', 'date', 'start', 'city', 'venue', 'price', 'url', 'source_id', 'source', 'status', 'cat']:
        if not isinstance(e.get(key), str) or not e[key]:
            raise ValueError('Missing/invalid '+key)
    if not isinstance(e.get('desc'), str) or any(key not in e for key in ('end','min','max')):
        raise ValueError('Missing event details')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', e['date']):
        raise ValueError('Invalid event date')
    date.fromisoformat(e['date'])
    if not re.fullmatch(r'\d{2}:\d{2}', e['start']):
        raise ValueError('Invalid start time')
    datetime.strptime(e['start'], '%H:%M')
    if e.get('end') is not None:
        if not isinstance(e['end'],str) or not re.fullmatch(r'\d{2}:\d{2}', e['end']):
            raise ValueError('Invalid end time')
        datetime.strptime(e['end'], '%H:%M')
    if e.get('endDate'):
        if not isinstance(e['endDate'],str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', e['endDate']):
            raise ValueError('Invalid end date')
        if date.fromisoformat(e['endDate']) < date.fromisoformat(e['date']):
            raise ValueError('End date before start')
    if (not e.get('endDate') or e['endDate']==e['date']) and e.get('end') is not None and e['end'] <= e['start']:
        raise ValueError('End time before start')
    if e['city'] not in CITIES:
        raise ValueError('Unsupported city')
    canonical(e['url'])
    if not isinstance(e.get('also_listed_at', []), list):
        raise ValueError('Invalid verified URL aliases')
    for url in e.get('also_listed_at', []):
        canonical(url)
    if not isinstance(e.get('alternate_ids', []), list) or any(
            not isinstance(value, str) or not value for value in e.get('alternate_ids', [])):
        raise ValueError('Invalid alternate IDs')
    if not isinstance(e.get('listings', []), list):
        raise ValueError('Invalid listing provenance')
    for listing in e.get('listings', []):
        if not isinstance(listing, dict) or not isinstance(listing.get('source_id'), str) or not isinstance(listing.get('source'), str):
            raise ValueError('Invalid listing provenance')
        canonical(listing.get('url'))
        if listing.get('checked_at'):
            checked = datetime.fromisoformat(listing['checked_at'].replace('Z', '+00:00'))
            if checked.tzinfo is None:
                raise ValueError('Listing timestamp needs timezone')
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
        conflicting_store = 'IKEA Tempe' in description
        if conflicting_store:
            description = 'Listed on the Emeryville calendar, but the description names another store. Confirm with IKEA before making a trip. '
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
                                   status='Confirm store details' if conflicting_store else status, min_age=lo, max_age=hi))
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
        if location.get('name') not in {'Temescal', 'Temescal Branch', 'Temescal Branch Library'}:
            continue
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
                         urlparse(source['url'])._replace(query='', fragment='').geturl().rstrip('/')+'/'+event['id']+'/', desc, status=status, min_age=lo, max_age=hi)
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


def parse_510_rss(xml, now):
    """Read articles as articles. Publication dates are never event dates."""
    try:
        doc = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise ValueError('510 RSS is not valid XML') from exc
    channel = doc.find('channel') if doc.tag == 'rss' else None
    if channel is None or not channel.findtext('title'):
        raise ValueError('510 RSS channel missing')
    output, seen = [], set()
    for item in channel.findall('item'):
        title, url = clean(item.findtext('title')), item.findtext('link', '').strip()
        if not title or urlparse(url).hostname != 'www.510families.com':
            continue
        try:
            canonical(url)
            published = parsedate_to_datetime(item.findtext('pubDate', ''))
            if published.tzinfo is None:
                raise ValueError('RSS publication date needs timezone')
        except (ValueError, TypeError):
            continue
        if not now-timedelta(days=30) <= published <= now+timedelta(hours=24):
            continue
        categories = [clean(c.text) for c in item.findall('category')]
        # Prefer weekend roundups and budget ideas, rather than every blog post.
        if not any(c.lower() in {'free & cheap', 'weekend', 'weekend planner'} for c in categories) and not re.search(r'weekend|things to do', title, re.I):
            continue
        key = canonical(url)
        if key in seen:
            continue
        seen.add(key)
        output.append(dict(id='guide-'+sha256(key.encode()).hexdigest()[:18],
            title=title[:180], url=url, published_at=published.isoformat(),
            checked_at=now.isoformat(), source='510 Families', source_id='510',
            summary=clean(item.findtext('description'))[:350], categories=categories[:8]))
    return sorted(output, key=lambda g:g['published_at'], reverse=True)[:8]


def fetch_510_rss(client, source, now):
    """One request to the RSS URL explicitly advertised in the publisher footer.

    This consumes the published syndication export, not calendar/blog crawling.
    No article links are followed and no browser impersonation is used.
    Page crawling by PublicClient continues to enforce robots.txt.
    """
    response = client.session.get(source['url'], timeout=(10, 25),
        headers={'Accept':'application/rss+xml, application/xml;q=0.9',
                 'User-Agent':'LittleWeekendsRSS/1.0 (personal RSS subscription)'})
    response.raise_for_status()
    if urlparse(response.url).hostname != 'www.510families.com' or len(response.content)>3_000_000:
        raise ValueError('Unexpected RSS response')
    return parse_510_rss(response.text, now)


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


def parse_clock(text):
    value=re.sub(r'\s+','',text).upper().replace('.','')
    for fmt in ['%I:%M%p','%I%p']:
        try:return datetime.strptime(value,fmt).strftime('%H:%M')
        except ValueError:pass
    raise ValueError('Unrecognized time')


def parse_alamedakids(html, source):
    soup=BeautifulSoup(html,'html.parser')
    listings=soup.select('table.views-table tr')
    if not listings:
        raise ValueError('Local family calendar structure missing')
    rows=[]
    for listing in listings:
        stamp=listing.select_one('.date-display-single[content]')
        title_tag=listing.select_one('a[aria-controls]')
        content=listing.select_one('div.collapse')
        if not stamp or not title_tag or not content:
            continue
        title=clean(title_tag.get_text())
        text=clean(content.get_text(' ',strip=True))
        if re.search(r'pantry|food bank|parent.*workshop|resource center|virtual|vaccin|support group',title,re.I):
            continue
        fields={}
        for field in ['Time','Cost','Location']:
            match=re.search(r'\b'+field+r'\s*:\s*(.*?)(?=\b(?:Date|Time|Cost|Location|Link)\s*:|Share:|$)',text,re.I)
            if match:fields[field]=match[1].strip()
        if not re.fullmatch(r'Free[.!]?',fields.get('Cost',''),re.I):
            continue
        venue=fields.get('Location','')
        city=next((c for c in sorted(CITIES,key=len,reverse=True) if re.search(r'\b'+re.escape(c)+r'\b',venue,re.I)),None)
        if not city:
            continue
        if not FAMILY.search(title+' '+text) and not re.search('festival|parade|lighting|celebrat|concert|workshop',title,re.I):
            continue
        times=re.fullmatch(r'(\d{1,2}(?::\d{2})?\s*[AP]M)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[AP]M)',fields.get('Time',''),re.I)
        if not times:
            continue
        link=next((a.get('href') for a in content.select('a[href]') if 'complete event details' in a.get_text().lower()),None)
        if not link:continue
        event_date=stamp['content'][:10]
        lo,hi=ages(text)
        # Descriptions exclude bookkeeping, share controls, and repeated dates.
        description=text.split('Date:',1)[0]
        rows.append(make_event(source,title,event_date+'T'+parse_clock(times[1]),event_date+'T'+parse_clock(times[2]),
                               city,venue,urljoin(source['url'],link),description,status='Local family calendar',min_age=lo,max_age=hi))
    return rows


def load_json(path, fallback):
    return json.loads(path.read_text()) if path.exists() else fallback


def event_urls(event):
    """Exact aliases and URLs from previously matched listings, never venue URLs."""
    return {canonical(url) for url in [event["url"]] + event.get("also_listed_at", [])
            + [item['url'] for item in event.get('listings', [])]}


def dedupe(events):
    """Combine exact matches, keeping provenance and every previously saved ID.

    Different URLs require the same title, venue, city, date and start. Similar
    titles or a shared city alone are not enough to merge two family outings.
    """
    priority = {'ikea':0,'opl':0,'alamedakids':1,'curated':2,'510':3,'funcheap':4}
    def normalized(value):
        return re.sub(r'[^a-z0-9]', '', str(value).lower())
    def keys(e):
        session = (e['date'], e['start'])
        result = {('url', url, *session) for url in event_urls(e)}
        if normalized(e.get('venue', '')) and not urlparse(e['url']).query:
            result.add(('title', normalized(e['title']), normalized(e['venue']), e['city'], *session))
        return result
    groups = []
    for event in events:
        event_keys = keys(event)
        matches = [g for g in groups if g['keys'] & event_keys]
        group = {'keys':set(event_keys), 'events':[event]}
        for match in matches:
            group['keys'].update(match['keys'])
            group['events'].extend(match['events'])
            groups.remove(match)
        groups.append(group)
    output = []
    for group in groups:
        ranked = sorted(group['events'], key=lambda x: (
            priority.get(x['source_id'], 5),
            -datetime.fromisoformat(x.get('checked_at','2000-01-01T00:00:00Z').replace('Z','+00:00')).timestamp()))
        winner = dict(ranked[0])
        ids, listings = set(), {}
        for e in ranked:
            ids.update([e['id'], *e.get('alternate_ids', [])])
            provenance = [dict(source_id=e['source_id'], source=e.get('source', e['source_id']),
                               url=e['url'], checked_at=e.get('checked_at'))] + e.get('listings', [])
            for item in provenance:
                key = (item['source_id'], canonical(item['url']))
                if key not in listings or (item.get('checked_at') or '') > (listings[key].get('checked_at') or ''):
                    listings[key] = dict(item)
        winner['alternate_ids'] = sorted(ids - {winner['id']})
        winner['listings'] = list(listings.values())
        output.append(winner)
    return sorted(output, key=lambda e: (bool(e.get('ongoing', e.get('endDate'))), e['date'], e['start'], e['title']))


def reconcile_previous_ids(previous, fresh):
    """Reuse a prior ID only for unambiguous, same-source matches.

    A URL identifies an organizer event but may contain multiple time slots, so
    rescheduling is matched only when there is one old and one new slot for
    that URL/date. Library detail URLs have unique event IDs, permitting a date
    move when there is exactly one old and new record for the URL overall.
    """
    def norm(value):
        return re.sub(r'[^a-z0-9]', '', str(value).lower())
    def event_key(e):
        return (e.get('source_id'), canonical(e['url']), e['date'])
    old_by, new_by = {}, {}
    for e in previous:
        old_by.setdefault(event_key(e), []).append(e)
    for index, e in enumerate(fresh):
        if not e.get('cancelled'):
            new_by.setdefault(event_key(e), []).append((index,e))
    matches = {}
    for key, olds in old_by.items():
        news = new_by.get(key, [])
        if len(olds)==len(news)==1:
            index, new = news[0]
            if olds[0]['start'] != new['start'] and norm(olds[0]['title'])==norm(new['title']):
                matches[index] = olds[0]['id']
    # The old collector stripped query strings. Preserve an old saved ID only
    # where one old and one fresh same-session record agree on title/venue.
    def base_key(e):
        u=urlparse(e['url'])
        return (e.get('source_id'), u.scheme, u.netloc, u.path.rstrip('/'), e['date'], e['start'])
    old_base,new_base={},{}
    for e in previous:
        old_base.setdefault(base_key(e),[]).append(e)
    for index,e in enumerate(fresh):
        if not e.get('cancelled'):new_base.setdefault(base_key(e),[]).append((index,e))
    for key,olds in old_base.items():
        news=new_base.get(key,[])
        if len(olds)==len(news)==1:
            index,new=news[0];old=olds[0]
            if not urlparse(old['url']).query and urlparse(new['url']).query and norm(old['title'])==norm(new['title']) and norm(old['venue'])==norm(new['venue']) and old['city']==new['city']:
                matches.setdefault(index,old['id'])
    # Library event detail URLs are unique; handle an unambiguous date move.
    old_lib,new_lib={},{}
    for e in previous:
        if e.get('source_id')=='opl':old_lib.setdefault(canonical(e['url']),[]).append(e)
    for index,e in enumerate(fresh):
        if e.get('source_id')=='opl' and not e.get('cancelled'):new_lib.setdefault(canonical(e['url']),[]).append((index,e))
    for key,olds in old_lib.items():
        news=new_lib.get(key,[])
        if len(olds)==len(news)==1:
            index,new=news[0];old=olds[0]
            if old['date']!=new['date'] and norm(old['title'])==norm(new['title']):matches.setdefault(index,old['id'])
    return matches


def merge_events(previous, curated, fresh, now, full_sources=()):
    today = now.astimezone(PACIFIC).date().isoformat()
    previous = [e for e in previous if e.get('source_id') != 'bn']
    curated = [e for e in curated if e.get('source_id') != 'bn']
    fresh = [e for e in fresh if e.get('source_id') != 'bn']
    identity = {(url,e['date'],e['start']):e['id'] for e in previous+curated for url in event_urls(e)}
    aliases = {e['id']: e.get('also_listed_at', []) for e in previous+curated}
    history = {e['id']:e for e in curated+previous}
    reconciled = reconcile_previous_ids(previous, fresh)
    moved_ids = set(reconciled.values())
    live_opl_urls = {canonical(e['url']) for e in fresh if e['source_id'] in {'opl'}}
    cancelled = {(canonical(e['url']),e['date']) for e in fresh if e.get('cancelled')}
    by_id = {e['id']:dict(e) for e in previous if e.get('source_id') != 'curated'
             and e.get('source_id') not in full_sources
             and e['id'] not in moved_ids
             and canonical(e['url']) not in live_opl_urls}
    fresh_rows = []
    for index, event in enumerate(fresh):
        event = dict(event)
        key = (canonical(event['url']),event['date'],event['start'])
        event['id'] = reconciled.get(index,identity.get(key,event['id']))
        prior = history.get(event['id'], {})
        for field in ('alternate_ids', 'listings'):
            if prior.get(field):
                event[field] = prior[field]
        if aliases.get(event['id']):
            event['also_listed_at'] = aliases[event['id']]
        if event.get('cancelled'):
            continue
        event['checked_at'] = now.isoformat()
        event.pop('stale',None)
        fresh_rows.append(event)
    pool = []
    for event in list(by_id.values())+fresh_rows+curated:
        event = dict(event)
        if event['source_id'] != 'curated':
            event['id'] = identity.get((canonical(event['url']),event['date'],event['start']),event['id'])
        if (canonical(event['url']),event['date']) in cancelled:
            continue
        if event['source_id']=='curated' and 'ikea' in full_sources and 'ikea.com/us/en/stores/events/ikea-emeryville-ca/' in event['url']:
            continue
        if not allowed_library(event):
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


def library_page_url(url, page):
    # Keep the public branch filter on every page. Detail URLs omit filters.
    return url if page == 1 else url + ('&' if '?' in url else '?') + f'page={page}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', nargs='*', default=['ikea','opl','alamedakids','510','funcheap'])
    parser.add_argument('--pages', type=int, default=4)
    parser.add_argument('--max-details', type=int, default=90)
    parser.add_argument('--output', type=Path, default=DATA/'events.json')
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    client = PublicClient()
    previous = load_json(args.output, {})
    prior_status = {s['id']:s for s in previous.get('sources',[])}
    fresh, statuses, successes = [], [], 0
    guides = previous.get('guides', [])
    for source in SOURCES:
        status = dict(source)
        prior = prior_status.get(source['id'],{})
        if prior.get('kind') != source.get('kind'):
            prior = {}  # A calendar scan does not count as a successful RSS refresh.
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
                        rows += parse_opl(client.get(library_page_url(source['url'],page)),source)
                    note = f'First {args.pages} pages of the Temescal-filtered calendar; Temescal Branch only; children/family audiences.'
                elif source['id'] == 'alamedakids':
                    rows = parse_alamedakids(client.get(source['url']),source)
                    note = 'Free local family events, including festivals, workshops, and San Leandro / Castro Valley activities.'
                elif source['id'] == '510':
                    guides = fetch_510_rss(client,source,now)
                    rows = []
                    note = 'Publisher RSS: recent weekend and budget articles, not a calendar feed. Article publication dates are not event dates; guides can include paid ideas.'
                else:
                    rows,note = collect_funcheap(client,source,args.pages,args.max_details)
                for e in rows:
                    validate_event(e)
                fresh += rows
                status.update(state='ok', count=len(guides) if source['id']=='510' else len(rows), last_success=now.isoformat(), note=note)
                successes += 1
            except Exception as exc:
                logging.exception('Source failed: %s',source['id'])
                status.update(state='error', note=f'Could not refresh ({type(exc).__name__}); retained recent listings. Check the source directly.')
        if source['id']=='510' and status.get('state')=='error':
            status['note']='RSS refresh failed; retained recent guide links. The full 510 calendar is not being imported.'
        statuses.append(status)
        unit = "guides" if source.get("kind")=="articles" else "events"
        print(f'{source["id"]}: {status["state"]} ({status.get("count",0)} {unit})',flush=True)
    curated = load_json(DATA/'curated.json', [])
    merged = merge_events(previous.get('events', []),curated,fresh,now, full_sources={s['id'] for s in statuses if s['id']=='ikea' and s['state']=='ok'})
    result = dict(schema_version=1, generated_at=now.isoformat(), last_successful_collection=now.isoformat() if successes else previous.get('last_successful_collection'),
                  sources=statuses, events=merged, guides=[g for g in guides if now-datetime.fromisoformat(g['checked_at'].replace('Z','+00:00'))<=timedelta(days=14)], note='Public, free family listings. Collection is bounded and may miss events. Check organizer details before attending.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(args.output)
    print(f'Published {len(merged)} upcoming listings; {successes} sources refreshed.')
    return 0 if successes else 1


if __name__ == '__main__':
    raise SystemExit(main())
