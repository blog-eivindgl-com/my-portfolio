# Issue 9 name corrections: local verification

Date: 5 October 2026. Computer: Yoga7X-Eivind, Windows ARM64. Base: main `b93b057cb5df5b67d25590899e630adfb35ec53b` (PR #29 merged). Branch: `feat/issue-9-safe-name-corrections`. After reviewing local results, the owner authorized commit, push, a draft PR and exact-head CI verification. No merge or deployment is authorized. PR #27 remains parked at `60adbcca6fbaff505e3f1286600642cf486cd17d` and no accounting-policy changes are included.

The [contract](../name-corrections.md) defines the bounded scope. Unit tests cover both stores' command receipts, same-base races, all-store rollback, retry/restart after later renames, invalid names/identities, refusal of inconsistent evidence, duplicate display names, shared sequence allocation with transaction corrections, backup round-trip and conflict/stale-preview protection. Browser tests cover both routes/list links, cancellation, validation, repeated submission, storage failure, real two-tab conflicts and dataset replacement, missing records, and fresh-context backup recovery across UTC/en-US, Los Angeles/en-US and Oslo/nb-NO.

Node 24.21.0 / Yarn 1.22.22, installed Edge 154.0.4258.53. Tests use synthetic fixtures, fake IndexedDB and nonpersistent Edge contexts on localhost port 3100. No real portfolio, browser profile or cloud-drive contents are accessed.

- Full unit suite: **201 tests across 9 suites passed**, including 24 new name-command cases (55.36 seconds including runner startup).
- Standalone `yarn typecheck`: passed (177.74 seconds).
- `yarn lint`: passed without warnings/errors (23.82 seconds).
- `yarn build`: passed (36.73 seconds), including both new edit routes. Existing NextUI SSRProvider warnings remain.
- Full isolated Edge browser regression: **150 cases passed** (262.65 seconds), comprising all 117 existing cases and 33 new name-correction cases across UTC, Los Angeles and Oslo. No failures or retries were needed.
- `git diff --check`, whitespace inspection of changed/new files, and changed-file credential-pattern scan passed. Thirteen changed/new files comprise this slice. The parked PR #27 checkout remains clean at its original head. This record captures local verification before publication; the draft PR's GitHub checks supply exact-head CI evidence.

Dependencies, schema and portable backup versions are unchanged. No historical identities are reassigned or inferred. Existing financial-calculation and framework/security limits remain; this is not remote-sync or physical device-loss verification. Name operations retain the existing changing-restore/new-dataset contract, which replaces local operation history with a baseline; portable backups preserve names and identities, not audit history or retry receipts.
