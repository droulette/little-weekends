# Little Weekends

A free family-outing planner for Oakland and nearby East Bay cities. Static HTML/JavaScript on GitHub Pages, with a daily Python collection job in GitHub Actions. No database, AI API key, paid hosting account, or server to maintain.

## What works

- This weekend, next weekend, and future events; city, age, activity, and price filters.
- Free-only is selected by default. Imported events require free admission. RSS guide articles are separate reading links and can include paid activities.
- Save plans and personal additions in your browser; export them to an `.ics` calendar file.
- Ongoing activities, such as IKEA's gnome hunt, sort below dated activities.
- Source-specific refresh status, timestamps, stale-listing labels, and manual-source notes.
- Existing IKEA event IDs are preserved when a live listing replaces a starter card.

## Current collection coverage

| Source | Collection method | Limits |
| --- | --- | --- |
| IKEA Emeryville | Official store page's embedded public event data | Store `sto165` only; free family activities; individual sessions and registration capacity |
| Temescal Branch Library | Public calendar's embedded event data | First six pages of the public Temescal-filtered calendar; Temescal Branch only; kids/family audiences; not the entire library calendar |
| 510 Families | Official publisher-linked RSS feed | Recent weekend/budget articles shown as guide links, not event cards; no full calendar import or inferred event dates |
| Funcheap East Bay | Structured event listings and family-keyword detail pages | Conservative: requires free price, a local structured address, and family wording; can find zero matching events |
| Alameda Kids | Public local family calendar | Explicitly free activities in supported cities; includes San Leandro, Castro Valley, and local Home Depot listings. |
| Home Depot Emeryville | Hand-checked starter dates | Confirm participation and registration at the local store |
| Michaels East Bay Bridge | Hand-checked national starter dates | Local participation is unconfirmed; store 1538 only |
| Downtown San Leandro / Castro Valley Chamber | Hand-checked festival dates and source links | Automatic importers not implemented |

Supported cities: Oakland, Emeryville, Berkeley, Albany, Alameda, El Cerrito, San Leandro, and Castro Valley.

Collection checks `robots.txt`, throttles public requests, and does not log in, use private accounts, bypass blocks, or invent missing dates, times, prices, or age limits. Third-party markup can change. A refresh is not a guarantee an event is still happening or has registration space.

A failed refresh retains recent events and shows the failure. Imported listings become stale after seven days without confirmation and expire after fourteen. Hand-checked starter cards remain until their date passes, with an older-listing label after seven days. The collector scans a bounded window, so absence from one run does not imply cancellation. Explicit cancellations on refreshed library records are removed; a successful full IKEA snapshot replaces prior IKEA sessions. Other listings age out if they cannot be reconfirmed.

## Run locally

Python 3.12+ and Node.js 20+ are recommended. Run commands in this folder.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node tests/frontend.cjs
python scripts/collect_events.py --pages 6 --max-details 90
python scripts/validate_feed.py
python -m http.server 8000 --directory site
```

Open http://localhost:8000. A web server is needed because the page fetches `data/events.json`; opening `index.html` directly does not load that file.

## Publish on GitHub Pages

The source repository must be public for GitHub Free hosting. Only the application and public organizer listings belong in this repository. Browser plans, personal additions, email, credentials, and account registrations are never uploaded.

1. Create a public repository named `little-weekends` and push these files to its `main` branch, including the `.github` directory.
2. Open **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.
3. Open **Actions → Refresh events and publish → Run workflow**.
4. Wait for the `deploy` job to succeed. Its environment link is the published website.

If GitHub CLI is installed and signed in, `bash scripts/publish.sh` performs those steps for a new repository in your personal GitHub account. It refuses to overwrite an existing repository. Review the script first; it publishes the application publicly.

The workflow runs on changes to `main`, manual dispatch, and daily at **14:23 UTC** (6:23 am Pacific in winter, 7:23 am in summer). GitHub schedules can run late. In public repositories, GitHub can disable schedules after 60 days of inactivity; check the Actions page if the displayed refresh date is old. Re-enable the workflow there when necessary.

Collection and deployment happen in the same workflow. This matters because a commit made with `GITHUB_TOKEN` does not trigger a separate push workflow. The scheduled job records the new feed, then deploys it directly. An all-source outage still publishes retained data with error statuses, then marks the workflow failed.

## Files to learn from

- `site/index.html`: page layout and styles.
- `site/app.js`: filtering, rendering, browser storage, feed loading, and calendar export.
- `site/data/curated.json`: editable, hand-checked starter listings.
- `site/data/events.json`: generated public event feed and source status.
- `scripts/collect_events.py`: fetch → parse → validate → deduplicate → publish JSON.
- `tests/test_collector.py`: synthetic parser fixtures and failure scenarios.
- `tests/frontend.cjs`: minimal DOM test double for app behavior. This is not a visual browser test.
- `.github/workflows/update-and-deploy.yml`: daily refresh and Pages deployment.

The app does not use an LLM to collect events. Deterministic code handles these sources for free. AI can help add and review adapters or interpret a flyer later, but is not required for the scheduled pipeline.

## Personal saved plans

Saved plans are local to the browser and website address. Plans previously saved in the downloadable HTML do not automatically move to the hosted website. Calendar export from the original app is one way to retain those choices. Cross-device synchronization would be a separate feature.

## Reliability and maintenance

The main view hides stale, full, closed-registration, and unconfirmed-local listings by default. The “Include ideas that need confirmation” checkbox reveals them, and saved plans remain accessible. Events with a published start but no end time say “Starts …”; calendar export omits an invented end time. A public-feed cache keeps the last loaded collection available when a new fetch fails.

A separate daily ChatGPT maintenance task, “Keep Little Weekends current”, checks source freshness and failed imports, researches public local listings for sources that cannot be scraped reliably, and can update validated curated records or make bounded adapter repairs in this repository. It is not a promise of complete coverage. Website access restrictions are respected. Routine success is quiet; user action is requested only for an unresolved material blocker.

Curated records may include `also_listed_at`, a list of hand-verified exact event URLs. The merge uses these aliases only for the same date and start time, preserving the curated card ID when an automatic calendar imports the same outing under another title. Do not add guessed URLs or general venue aliases across unrelated sessions.

Library outings are limited to Temescal Branch, including listings from family calendars. A checked-by-default Saturday/Sunday filter also applies to Looking ahead; turn it off to see weekdays. Saved plans remain accessible, and ongoing events that overlap a weekend remain at the bottom.


### Listing freshness and duplicate handling

Cards and saved plans show their own last-check timestamp. Browser time determines
when a listing needs rechecking, including when using a cached feed. Missing or
invalid check dates stay out of the confirmed view; personal additions remain
available as user-entered ideas. The source summary counts successful automatic
scans within 48 hours, flags failed/overdue scans, and distinguishes zero matching
events from a failed import. Hand-checked sources are labeled explicitly.
Reload collection downloads the latest published JSON; it does not start a scan.

Duplicates combine only for exact URL/verified-alias + date/start matches, or an
exact normalized title + venue + city + date/start match. Different venues and
sessions remain separate. The preferred source's check date is retained; another
calendar's timestamp does not imply that the organizer was checked. Optional
`listings` preserve other matched sources and `alternate_ids` preserve older IDs.
Saved IDs migrate to the canonical card when loading a live or cached collection.
No fuzzy title matching is used, so uncertain duplicates can remain separate.


### 510 RSS and retired Barnes & Noble source

510's footer advertises `https://www.510families.com/feed/` as its RSS export.
It supplies articles rather than structured calendar records. One bounded request
consumes that explicit syndication URL with an RSS client identity; it does not
follow article links or crawl the calendar. `robots.txt` is still enforced for
page crawling. Guides use publication timestamps labeled as such, are separate
from free dated events, and cannot be saved/exported as calendar appointments.
Only recent weekend/budget articles are selected. Failed RSS requests remain
visible, retain guide links for at most fourteen days since their last successful
check, and never generate placeholder events. Existing dated 510 records expire
under the existing retention rules; RSS does not reconfirm them.

Barnes & Noble is removed from the active source list, collector and generated
feed. The frontend also excludes it from older browser-cached collections.


## Planning your outings

- **Choose a weekend:** pick any date and the app shows that week's Saturday and
  Sunday. The existing This weekend / Next weekend shortcuts remain available.
- **Plan status:** saved outings have Interested, Need to register, and Booked
  labels. These are personal notes; changing a label does not register or pay
  for an event. Each plan links to its organizer.
- **Overlapping times:** known start/end times on the same day are compared across
  saved plans. Back-to-back sessions do not conflict. Ongoing activities and
  unknown end times receive a timing note rather than an invented overlap.
  These checks do not account for travel time or flexible drop-in attendance.
- **Directions:** event cards and saved plans open a Google Maps directions query
  using the published venue and city. No location is collected by the app.
- **Back up plans / Restore backup:** download a JSON file with saved outings,
  statuses, saved event copies and personal additions. Restore merges valid
  backups with existing browser data, preserving current status choices. The
  whole file is checked before mutation; repeated imports do not duplicate IDs.
  Private plans are never uploaded to this repository. Transfer the backup file
  yourself to another browser/device; this is not automatic synchronization.
- **New since your last visit:** a badge and optional filter compare collected
  event IDs against this browser's earlier successful visits. First visits set
  a baseline without labeling everything new. Known duplicate aliases do not
  receive a false new badge. This is local to the browser, not an event organizer's
  announcement date.

Saved event copies keep plan details available when an outing leaves the public
collection. Such copies are clearly marked for organizer verification and stay
out of Discover. A backup can retain an older saved ID without details if that
browser never saved a copy of the event.


Discover groups dated events by weekday and date. Weekend views show Saturday and
Sunday separately, including an empty-day message when a filter excludes all
events on one day. Looking ahead groups each date chronologically. Ongoing and
multi-day activities appear once in a separate section at the bottom.
