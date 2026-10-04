# Issue 9 foundation: local verification

Date: 4 October 2026. Computer: Yoga7X-Eivind, Windows ARM64. Base: main `5ed6901f13cade931b026448331ac89d035ba96b`. Local branch: `feat/issue-9-atomic-foundation`, separate checkout `my-portfolio-issue9`. PR #27's branch/checkout is preserved at `60adbcca6fbaff505e3f1286600642cf486cd17d`; its undecided calculation policy is not included.

## Reviewed scope

Schema version 2 keeps the four domain stores and adds canonical identity/revision metadata, browser-local device/dataset/sequence state and a durable local outbox. Existing account/instrument/transaction creation commits domain records, metadata, operations and sequence allocation atomically. Transaction operations carry canonical account/instrument references. Restore is a separate atomic snapshot command over all seven stores.

The supported current v1 dataset migrates without rewriting domain values. Numeric-ID, historical ordered, unknown-store, malformed and unrecognized native layouts are refused and retained. Interrupted migration rolls back; retry is tested. This does not implement the complete historical migration acceptance criteria of #9.

The owner explicitly accepted breaking compatibility with prior test-data backups. Format 2 validates complete stable identities and source revisions; old files are rejected before mutation. Changed restores fork a new dataset, preserve entity IDs, retain the local device/sequence and atomically replace the queue with one new complete baseline. A no-op merge does not rewrite history. Portable backups never clone device identity or pending operations. No cloud sender/replay engine is present.

## Validation

Node 24.21.0 / Yarn 1.22.22, dependencies installed from main's unchanged frozen lockfile and local cache. Installed Edge 154.0.4258.53; fresh nonpersistent contexts only, synthetic fixtures, localhost port 3100. No user portfolio/profile or cloud-drive contents were accessed.

- Unit tests cover the existing validation/backup/calculation regressions plus durable creation, account/instrument canonical references, retry idempotency, separate-connection sequence allocation, failures after domain writes, all-seven-store restore rollback, source identity validation, stale metadata previews, migration preservation/interruption, unsupported historical layouts and sequence corruption.
- Browser tests cover all existing main-based transaction/backup flows, old-format rejection and five new foundation scenarios in each of UTC/en-US, Los Angeles/en-US and Oslo/nb-NO. The first run passed 66/69; the three failures were one test locator matching both a form error and Next's route announcer. Scoping that locator to the form fixed all three without application changes.
- Final `yarn test`: all 6 suites / 138 tests passed (2.73 seconds including runner startup).
- Final `yarn typecheck`: passed (148.57 seconds); `yarn lint`: passed without warnings/errors (1.44 seconds).
- Final `yarn build`: passed (8.92 seconds using the build cache; the initial clean worktree build took 189.97 seconds).
- Final `PLAYWRIGHT_CHANNEL=msedge yarn test:e2e`: all 69 cases passed (73.12 seconds), including all 51 main-based cases, three old-format rejection cases and 15 foundation cases.
- Frozen offline install, `actionlint`, `git diff --check`, new-file whitespace checks and a changed-file credential-pattern scan passed. Package versions and lockfile are unchanged. The test server stopped after the suite.
- The parked PR #27 checkout is clean at its original head. This record describes local verification before publication; calculation services/viewmodels were not changed.

## Remaining work and limits

See [foundation contract and remaining issue scope](../issue-9-foundation.md). Canonical UUIDs are currently sidecar mappings; native instrument UUID keys, optional tickers, explicit share/fund/currency entry, historical remapping, update/delete/tombstones, causal conflict/replay/acknowledgement/retention and connected restore semantics are not implemented. Currency and trade ordering remain unknown rather than inferred. Existing main calculation defects and security debt remain; no #17 policy adoption is implied by passing characterization tests.

Schema 2 cannot be opened by old main or PR #27. Test this branch on a separate origin/profile; changing branches does not downgrade browser storage. The recovery-only archive explicitly omits local foundation stores and is not an exact pending-queue backup.

Remote CI results belong to the exact published PR head. Other browser engines, a fresh security audit and physical device-loss testing were outside local verification. Existing Next/NextUI warnings remain. The owner subsequently authorized a draft PR; issue 9 remains incomplete, with no merge, deployment or policy adoption.
