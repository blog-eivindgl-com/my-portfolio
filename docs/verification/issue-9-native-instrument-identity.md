# Native instrument identity verification — 2026-10-05

Branch: `feat/issue-9-native-instrument-identity`.
Base: merged main/PR #31, `f64bc7816cb3ed68f121fcb93b07994e415bdba4`.
This record captures local verification before publication. Publication was separately authorized; merge and deployment remain excluded.

Environment: Yoga7X-Eivind, Windows ARM64, pinned Node 24.21.0 and Yarn 1.22.22. Tests used synthetic fixtures and fresh nonpersistent Edge contexts only. No actual portfolio, browser profile or cloud-drive data was opened.

## Checks

| Check | Command | Result |
| --- | --- | --- |
| Unit | `node node_modules/jest/bin/jest.js --runInBand` | 291 passed, 14 suites, 4.436 s |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passed, exit 0 |
| Lint | `node node_modules/next/dist/bin/next lint --max-warnings 0` | Passed; no warnings/errors |
| Production build | `node node_modules/next/dist/bin/next build` | Passed, including compile, type validation and static generation |
| Browser | `PLAYWRIGHT_CHANNEL=msedge node node_modules/@playwright/test/cli.js test` | 180 passed, 3.6 min; 60 cases in each timezone |
| Whitespace | `git diff --check` | Passed |

Logs are retained in the host temporary directory as `issue9-historical-final-unit.log`, `issue9-historical-types.log`, `issue9-historical-lint.log`, `issue9-historical-build.log`, and `issue9-historical-browser-final.log`.

## Regression evidence

- `NativeIdentity.test.ts`: supported v1/v2/v3 migration, unchanged financial inputs/references, unchanged legacy operation contents, preserved UUIDs/revisions/dataset, retained rename/update/delete receipts and tombstones, backup/restart, duplicate tickers, case-insensitive UUID collision refusal, metadata validation, concurrent connections, digest tampering, rollback at every native metadata persistence point, interruption after reference conversion with intact v3 rollback and successful retry, unknown numeric/ordered variant and newer layout refusal, corrupt source identity refusal.
- `HistoricalMigration.test.ts`: exact numeric/UUID/ordered source fixtures, separate numeric key namespaces, fractional values, retained source mappings and explicit/missing order, UUID collisions, source-evidence tampering, timestamp/extra-field/orphan refusal, contradictory and duplicate order, backup and correction roundtrips, interruption after original stores are staged/deleted, and concurrent upgrades.
- `NativeHistory.test.ts`: native create/rename/update/delete replay, restored baselines, missing operations, sequence gaps, mismatched heads/devices/versions/references, revision and current-record divergence, unknown fields, duplicate operations/UUIDs, altered rename evidence, reopen/auto-open refusal, concurrent snapshots/retries, undefined/NaN/negative-zero evidence.
- Frozen `Foundation`, `IdentityIntegrity`, and `LegacyCorrectionsMigration` tests retain coverage of the original migration/receipt contracts. Existing backup, transaction, name correction and chronology suites now also exercise the native format where applicable.
- Browser coverage includes backup replacement/merge/recovery, migration interruption/retry, retained corrupt history, real two-tab races, stale commands, optional wall-clock time and DST boundaries, transaction editing/deletion, tickerless instruments, explicit kind/currency metadata, UUID links, duplicate-ticker ambiguity, and instrument retry after digest persistence failure; exact numeric/ordered migrations, duplicate-order diagnostics, rollback after store recreation, simultaneous upgrade openers, and same-day explicit order. Every browser case runs in UTC, America/Los_Angeles and Europe/Oslo.

The first browser run caught missing live-query dependencies after UUID resolution and generic errors on unavailable instruments; both were fixed. New test setup was also corrected to wait for a completed baseline before failure injection, and selectors were narrowed to avoid Next's route-announcement alert. Intermediate failing runs are not counted as final passes.

Known non-failing output: the existing NextUI SSRProvider warning and Playwright's NO_COLOR/FORCE_COLOR warning. Framework versions were not upgraded.

## Deliverables and scope

The migration/schema/history implementation is in `src/app/database/{foundation,instrumentMigration,identityIntegrity,operationIntegrity}.ts` and `types/`. Repository, backup and UUID resolution changes are in `src/app/services/`. Instrument creation/list/name/transaction screens and the backup screen use the native contract. `src/app/legacy/` freezes the source schema's verifier and fixtures' repository/backup behavior. The new portable fixture is `test-fixtures/backup/portfolio-v4.json`.

See [Native instrument identity](../native-instrument-identity.md) for the contract and requirement-by-requirement audit. All three known historical fixture layouts now migrate. Unknown/ambiguous variants retain their evidence with actionable refusal. The local issue-9 acceptance criteria have implementation and regression coverage. The explicitly listed #17 accounting-policy dependency remains unresolved; #19 cross-device replay/conflicts/transport remains separate. The local hashes are not remote authenticity or conflict resolution.

Local main remains `efb1b244f91393c75a6aa20a7be4672b2a48e488`; parked PR #27's local branch remains `60adbcca6fbaff505e3f1286600642cf486cd17d`. Neither was modified. The native implementation was verified before the publication commit.

The historical extension read issue #9 directly and inspected original schema/service code at `3a4f477^` and `d2d7cc95`. A TypeScript-target iterator compatibility failure was corrected with explicit array conversion; no target or framework upgrade was made. The successful rebuild includes that correction.

The first historical browser aggregate had 177 passes and three failures because the backup screen hid migration-specific refusal details. A typed historical migration error now exposes the actionable diagnostic (including unknown-layout refusals); the final complete 180-case browser run passes. Final standalone typecheck, zero-warning lint, production build, 291-test unit run and whitespace check also pass. No check is left running or counted from an interrupted process.
