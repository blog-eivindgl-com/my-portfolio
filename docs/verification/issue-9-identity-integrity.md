# Issue 9 identity integrity: local verification

Date: 5 October 2026. Host: Yoga7X-Eivind, Windows ARM64. Remote main was checked with `git ls-remote origin refs/heads/main` and remained `50b7c1aebc15f00e704cc6c3fc3378d8a4d2f80d`. The local implementation branch is `feat/issue-9-verified-identity-history`, created at that commit. Local main and parked PR #27 refs were not moved. This record captures local validation before publication. The owner subsequently authorized committing, pushing, opening a draft PR and verifying exact-head CI. No merge or deployment is authorized.

## Files and preserved work

- `src/app/database/identityIntegrity.ts`: adopts the pre-existing untracked verifier after inspection, fixes its ES5-target iteration and lossy JSON comparison, and computes report reference counts in linear passes. Its untouched original was copied to `C:/Users/eivin/AppData/Local/Temp/issue9-identityIntegrity-original.ts`, SHA-256 `6CCB7746E2EBA02B98203BDA8181B1A5140E7DF70725F05AA9D5670B4F3E9FD6`.
- `src/app/database/foundation.ts`: validates retained history atomically during v2 upgrades and at every connection open; inspects supported native schema-3 layouts as well.
- `src/app/services/backupFormat.ts`: refuses case-aliased entity UUID collisions before restore.
- `src/app/backup/page.tsx`: displays the specific integrity error and storage-preservation instruction.
- `__tests__/services/IdentityIntegrity.test.ts`: 25 new synthetic cases.
- `e2e/identity-integrity.spec.ts`: storage-refusal/preservation regression in each browser configuration.
- `docs/identity-integrity.md`, `docs/issue-9-foundation.md`, and this verification record: scope, versions, limits and remaining migration work.

## Environment and commands

Node 24.21.0 from the existing ARM64 toolchain; Yarn 1.22.22 for the Playwright web-server command; Edge 154.0.4258.53. All fixtures are synthetic. Browser runs use fresh nonpersistent contexts and localhost port 3100, across UTC/en-US, America/Los_Angeles/en-US and Europe/Oslo/nb-NO. No actual portfolio/profile or cloud-drive data was accessed.

Commands use the repository's installed dependencies:

```text
node node_modules/jest/bin/jest.js --runInBand
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next lint --max-warnings 0
node node_modules/next/dist/bin/next build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
node node_modules/@playwright/test/cli.js test
```

The new tests cover exact historical before/after and command agreement, canonical reference mismatches, duplicate/case-aliased UUIDs, unknown operation versions/fields, missing/gapped operations, wrong device/head/revision state, tombstones, name and transaction receipts after later edits/deletion, restart, later-sequence restored baselines, backup roundtrip, concurrent connection checks/retries, explicit and implicit opening refusal, and rollback of invalid v2 upgrades followed by a valid synthetic retry. Existing suites retain v1 interrupted-migration rollback/retry, ambiguous historical schema refusal, all-store rollback, restore interruption, two-tab conflicts and mutation durability coverage.

During development the new browser test first raced fresh database initialization; it now waits for the export download before injecting corruption. The subsequent run found that the Backup page hid integrity failures behind its generic storage error; the display fix is included and the targeted test passes in all three configurations. Initial TypeScript validation also caught the pre-existing verifier's iterator incompatibility with the ES5 target, now fixed. Initial Jest setup needed real timers for IndexedDB, matching the other service suites. Final inspection also identified lossy JSON comparison of native history values; structural comparison and explicit undefined/NaN/negative-zero corruption tests close that gap.

## Final results

- Full Jest suite: **226 tests / 10 suites passed**, including 25 new integrity cases (3.16 seconds reported by Jest).
- Standalone TypeScript check: **passed**, exit 0.
- Standalone lint: **passed**, no warnings/errors.
- Production build: **passed**, including build-time type/lint checks.
- Full Edge browser suite on the final build: **153 passed in 3.2 minutes**, with no failures or retries (150 existing cases plus the new integrity check in three timezone/locale configurations).
- `git diff --check` and whitespace checks of new files: **passed**.

Final unit, build and browser logs are retained under `C:/Users/eivin/AppData/Local/Temp/issue9-integrity-{unit,build,browser}-final.log`. Nine source/test/documentation files form this slice. The prerequisite is complete with no remaining validation blocker; native UUID keys are not implemented. See the [scope and limitations](../identity-integrity.md) before planning that migration.
Existing NextUI SSRProvider and Node deprecation/environment warnings remain; no framework or accounting-policy changes are included.
