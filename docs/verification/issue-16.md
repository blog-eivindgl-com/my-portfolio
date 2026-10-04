# Issue #16: local backup and validated restore

Base: merged `main` at `8db9bbdb174546c5a1e2bbdb94cc3ff426adbed1` (PR #25). Branch: `feat/issue-16-backup-restore`. Date: 4 October 2026. This record describes local verification; the pull request records hosted checks for its exact published head. No real portfolio/profile/cloud data was accessed.

## Delivered scope

Versioned local JSON export of the current four collections; strict format/record/reference validation; explicit add-only merge or full replacement; preview counts/conflicts; required downloaded pre-import snapshot and user confirmation; atomic restore and rollback; stale-preview rejection after another tab changes data; retry/cancel/success safeguards. See [the contract and recovery procedure](../backup-restore.md).

A separate recovery-only archive preserves the actual known historical storage layout and tagged scalar values without repairing them. Numeric identities, missing/undefined fields, nonfinite numbers, negative zero, dates and known order/timestamp fields are retained. It is deliberately rejected by validated restore. Unknown fields/stores or nested/binary values block archival rather than leaking possible authorization data or silently discarding data. This is a bounded preservation path, not #9 migration or a generic IndexedDB clone.

## Verification

Environment: Yoga7X-Eivind, Windows ARM64, Node 24.21.0, Yarn 1.22.22; Playwright uses isolated nonpersistent Edge contexts and synthetic fixtures. Service tests use fake IndexedDB databases named `synthetic-*`.

- `yarn test`: all 5 suites / 115 tests passed (34 backup/recovery tests plus the existing 81 tests). Coverage includes exact identities/references/values, unchanged current calculation output, incompatible/malformed input, conflicting/duplicate identities, size limits, stale previews, recovery copy matching, concurrent application, explicit abort/partial-write rollback and retry, and recovery-only historical/type preservation.
- `yarn lint`: passed with no warnings/errors. The production build also reran lint against the final page.
- `yarn typecheck`: final standalone run passed in 148.46 seconds, including generated Next route declarations.
- `yarn build`: final production build passed, including the `/backup` route and page generation. A disallowed named page export found by the first build was made private; the final build passed in 8.05 seconds using the existing compilation cache.
- `PLAYWRIGHT_CHANNEL=msedge yarn test:e2e`: all 51 tests passed in 50.2 seconds against the production server. Edge 154.0.4258.53 / Playwright 1.63.0; UTC/en-US, America/Los_Angeles/en-US and Europe/Oslo/nb-NO. This includes 30 backup/recovery scenarios and all 21 issue-8 transaction-entry regressions.
- Browser checks verified real downloaded JSON and exact re-export from a fresh browser context; explicit cancellation/confirmation; successful recovery using the saved pre-import file; conflicting and identical merges; a second tab invalidating the preview; a newly downloaded recovery snapshot including that tab's changes; rollback after earlier stores were already written; retry/double click; failed-download safeguards; and rejection of recovery-only archives by validated import.
- `actionlint`, `git diff --check`, and whitespace review of new files: passed. The test server stopped and port 3100 is free.

Known baseline SSRProvider/Browserslist notices and legacy API deprecations remain visible. No new runtime dependencies or database schema changes were introduced. Other operating systems/browser engines and a fresh dependency audit were not part of this local verification; consult the pull request for hosted CI results.

## Boundaries

- No database version change, record repair, sync identity/outbox, cloud access or financial-policy changes.
- Browser download completion cannot be proved by the app; the user must verify the independent recovery file before confirming. The write service independently verifies snapshot consistency.
- Backup files are plaintext and have 10 MiB / 100,000-record limits. Encryption and large/unsupported structured-value recovery require separate work.
- Invalid current records block validated restore because a valid reversible pre-import snapshot cannot be made; recovery-only export preserves supported historical evidence without authorizing replacement.
- Legacy Next/NextUI security advisories and existing calculation-policy defects remain. Passing roundtrip comparisons demonstrates preservation of current calculation output, not financial correctness.
- Device crash, physical disk exhaustion, disk loss, browser-storage eviction, Firefox/WebKit, manual accessibility/visual review and remote CI are not established by local synthetic tests. No public release approval is implied.
