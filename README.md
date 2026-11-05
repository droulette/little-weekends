# Little Weekends

A free family-outing planner for Oakland and nearby East Bay cities. Static HTML/JavaScript on GitHub Pages, with a daily Python collection job in GitHub Actions. No database, AI API key, paid hosting account, or server to maintain.

## What works

- This weekend, next weekend, and future events; city, age, activity, and price filters.
- Free-only is selected by default. Imported events require free admission; regular Barnes & Noble in-store storytime is treated as its free storytime program when no ticket or purchase requirement is listed.
- Save plans and personal additions in your browser; export them to an `.ics` calendar file.
- Ongoing activities, such as IKEA's gnome hunt, sort below dated activities.
- Source-specific refresh status, timestamps, stale-listing labels, and manual-source notes.
- Existing IKEA event IDs are preserved when a live listing replaces a starter card.

## Current collection coverage

| Source | Collection method | Limits |
| --- | --- | --- |
| IKEA Emeryville | Official store page's embedded public event data | Store `sto165` only; free family activities; individual sessions and registration capacity |
| Oakland Public Library | Public calendar's embedded event data | First six pages; kids/family audiences; not the entire library calendar |
| 510 Families | Calendar pages plus individual structured event pages | First six list pages, at most 90 unique details; exact free-admission labels and supported cities only |
| Funcheap East Bay | Structured event listings and family-keyword detail pages | Conservative: requires free price, a local structured address, and family wording; can find zero matching events |
| Barnes & Noble Emeryville | Official store page’s embedded calendar | Local store 2072 only; regular storytimes and explicitly free children’s events. Missing end times stay unknown. |
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
