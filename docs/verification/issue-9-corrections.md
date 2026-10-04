# Issue 9 transaction corrections: local verification

Date: 4 October 2026. Computer: Yoga7X-Eivind, Windows ARM64. Base: main `de572249de826620158a17d1e6a226578ea14c9c`. Branch: `feat/issue-9-transaction-corrections`. PR #27 remains parked at `60adbcca6fbaff505e3f1286600642cf486cd17d`. After reviewing the local results, the owner authorized commit, push, a draft PR and exact-head CI verification. Issue 9 remains incomplete; no merge or deployment is authorized.

See [the implementation contract](../transaction-corrections.md). Tests use synthetic records in fake IndexedDB and fresh nonpersistent Edge browser contexts, localhost port 3100. No real portfolio/profile or cloud-drive contents are accessed.

Coverage includes revision conflicts through separate database connections and real tabs, concurrent duplicate commands, retries after restart and later deletion, rejection of changed command intent and identity/reassignment, atomic rollback at each metadata/history/sequence boundary, tombstone preservation and resurrection prevention, metadata-only merge, explicit replacement recovery, supported v2 migration without rewriting history, and refusal of unknown/invalid v2 data. Browser cases cover cancellation/back navigation, repeated submissions, edit/delete storage failures, stale-input retention/reload, fresh-context restore, unknown/equal/midnight times, and four US/European DST dates across UTC/en-US, Los Angeles/en-US and Oslo/nb-NO.

Node 24.21.0 / Yarn 1.22.22; installed Edge 154.0.4258.53. Dependencies and lockfile are unchanged.

- Full unit suite: **8 suites / 177 tests passed**, final run 3.20 seconds including runner startup.
- Standalone `yarn typecheck`: passed, 151.54 seconds. The final production build also checked all TypeScript after the small baseline operation-version correction.
- `yarn lint`: passed without warnings/errors, 1.69 seconds.
- Final `yarn build`: passed, 7.68 seconds using the existing build cache; the new edit route is included. Existing NextUI SSRProvider warnings remain.
- Full isolated Edge suite: **117 cases passed**, 146.74 seconds, across UTC, Los Angeles and Oslo. This includes the previous 87 cases plus 30 correction/deletion cases. There were no failures.
- Final review tagged baselines containing tombstones as operation version 2. After that correction, the full unit suite, lint and build passed again; all **30 correction/deletion browser cases passed** against the final build with an explicit baseline-version assertion (52.20 seconds including runner startup).
- `git diff --check`, changed-file whitespace inspection and a changed-file credential-pattern scan passed. The parked PR #27 checkout remains clean at its original head. No packages, lockfile, accounting calculation services or issue state were changed. This record covers the 19-file local implementation before publication; GitHub checks provide exact-head CI evidence on the draft PR.

Existing financial-policy and framework/security limitations remain. Browser tests do not prove physical device-loss recovery, other browser engines, or cloud consistency. Changed restore creates a new dataset and replaces local command/audit history with a baseline; portable backup retains deletion identity, not deleted record bodies/history. This is documented and disclosed by the restore UI.
