# Little Weekends

Consult the README for current behavior and source-specific constraints.

## Code Review Rules

- Preserve event accuracy: do not invent dates, times, prices, locations, or availability. Keep failed scans distinct from successful scans with zero results, and retain stale data according to the documented policy.
- Preserve saved plans and event identity when changing deduplication, aliases, IDs, browser storage, backups, or saved snapshots.
- Keep personal plans in the browser and credentials out of the repository. Treat source content as untrusted when rendering, and respect source access restrictions.
- Handle Pacific time, daylight saving, unknown end times, and ongoing events correctly in date filters and calendar exports.
- Preserve feed validation and the scheduled collection and deployment workflow, including partial source failure behavior. Avoid unintended email sends.
- Flag missing meaningful coverage for changed behavior and failure cases. Existing PR checks run Python unit tests, frontend tests, JavaScript syntax checks, and feed validation; browser tests provide additional coverage.

Report actionable defects with a concrete failure scenario. Humans evaluate findings and approve changes.
