# Review guidance

Focus on actionable defects introduced by the change. For each finding, identify the relevant code and a concrete failure scenario. Avoid speculative findings and style-only comments.

Pay particular attention to:
- Event data: don't invent dates, times, prices, locations, or availability. Preserve the distinction between an empty successful scan and a failed scan, and retain stale data according to the documented policy.
- Event identity and saved plans: check duplicate matching, aliases, existing IDs, storage migrations, backups, and saved snapshots for regressions or data loss.
- Privacy and safety: personal plans remain in the browser; don't expose credentials, upload personal data, or render untrusted source content unsafely. Respect source access restrictions.
- Dates and calendar exports: consider Pacific time, daylight saving, unknown end times, and ongoing events.
- Collection and publishing: check partial source failures, feed validation, and the scheduled refresh/deploy workflow. Avoid accidental email sends.
- Tests: look for meaningful coverage of changed behavior and failure cases. Existing PR checks run Python unit tests, frontend tests, JavaScript syntax checking, and feed validation. Browser tests provide additional coverage.

Use the README for current behavior and source-specific constraints. Humans are responsible for evaluating findings and approving changes.
