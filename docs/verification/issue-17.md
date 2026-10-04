# PR #27 compatibility update after native identity migration

Date: 5 October 2026. Rebased onto merged main `f5a0fe5a7348b782998c2c1732ec827a872984c1` (PR #32). The original PR head `60adbcca6fbaff505e3f1286600642cf486cd17d` is preserved locally at `recovery/pr27-before-main-60adbcc`.

The trial accounting policy remains undecided. The 74 realized / 606 remaining cost / -6 unrealized worked comparison and standard-view fee formulas are unchanged. The experiment now consumes schema4 native instrument UUIDs and nullable ticker/currency metadata. Duplicate or absent tickers cannot combine instruments. Standard links use UUID routes.

Main's schema4 migration, portable backup4 contract, operation4 history, tombstones, revision checks, rename/correction/delete/retry behavior and integrity validation are retained. No persisted contract or migration is changed by this PR. Trial reads use a consistent transaction; viewing, changing cutoff and reloading preserve all eight stores as identical JSON snapshots in synthetic browser assertions.

The shared chronology validator governs the trial and standard view. Retained order or distinct clock labels can order same-day records; missing, equal or contradictory evidence blocks calculations, including same-type records. Quote cutoffs are UTC instants; trades include the entire cutoff calendar date. Unzoned trade clocks are not silently converted to UTC instants. The ledger exposes clock labels and retained order.

## Current verification

All checks use isolated synthetic fixtures on Windows ARM64 with Node 24.21.0, Yarn 1.22.22 and installed Edge. No actual portfolio, browser profile or cloud-drive data was accessed.

- Unit suite: **336 tests / 17 suites passed**. Includes all existing migration rollback/interruption, identity/history integrity, retry/concurrency, corrections, rename and backup round-trip suites, plus UUID and chronology experiment regressions.
- Strict lint: passed without warnings or errors.
- Production build: passed with the existing NextUI SSRProvider warnings.
- Standalone typecheck: passed. Two leftover ticker fields in browser fixtures were corrected before the successful run.
- Browser suite: 216/219 cases passed on the first complete run (5.6 minutes). The new edit/delete case failed in all three timezones because a successful save intentionally locks the editor until reload. The test now reloads the current revision before deletion; all three targeted reruns passed (9.8 seconds). Application behavior was not weakened. Together these cover all 219 cases across UTC, Los Angeles and Oslo.
- Browser coverage includes live rename/edit/delete propagation, tombstones, reload, duplicate and missing ticker labels, retained order, exact eight-store preservation, plus all existing migration rollback/interruption, backup/recovery and concurrency cases.
- Git whitespace check passed. Remote main and PR head were verified unchanged before the exact force-with-lease update. Remote CI is tied to the published head rather than this historical verification document.

The original verification below is historical evidence for the pre-rebase branch. Its schema1 descriptions, counts and dates do not describe the current schema4 build. Existing framework/security debt remains outside this compatibility update. No merge, deployment or issue closure is part of this work.

---

# Issue #17: local calculation-policy experiment

Base: merged `main` at `5ed6901f13cade931b026448331ac89d035ba96b` (PR #26). Branch: `fix/issue-17-portfolio-calculations`. Date: 4 October 2026. Local work only; no real portfolio/profile/cloud data was read or modified.

## Status and review boundary

The owner authorized testing the proposed policy on a feature branch while explicitly reserving agreement. **The policy is not accepted and #17 is not complete.** `/experiment` is an opt-in, read-only comparison page. The standard transaction view retains its existing fee formulas. See [the trial rules and worked comparison](../calculation-experiment.md).

The trial uses a pure decimal replay per `(accountId, ticker)`, capitalized/proportionally allocated purchase fees, net sale proceeds and explicit UTC cutoffs. It blocks oversells, malformed records, missing references and ambiguous same-day buy/sell order. Missing/conflicting quotes produce unknown valuations; stale quotes show estimates and incomplete currency support precludes a cross-instrument money total. The seven-day stale threshold is adjustable and is only a trial default.

The worked example produces realized gain 74, remaining cost 606 and unrealized gain -6, hence combined gain 68. The standard calculation produces 68 / 600 / 0 for the same partial sale, also totaling 68. UI and documentation explain the allocation difference without implying tax correctness or policy acceptance.

## Independent standard-view corrections

- Maintain state separately for each account/instrument. A buys 10 at 100, B buys 10 at 200, A sells 10 at 120 now yields A realized gain 200 before fees and B's remaining 10 shares / 2000 investment. Same-instrument summaries aggregate each account's final position.
- Preserve input array order; isolate subsequent closing events by account/instrument; show account IDs in rows; correct the closing-date return previously trapped inside `forEach`.
- Select the latest eligible finite positive price at/before valuation time, exclude future/invalid observations and retain epoch-zero timestamps.
- Missing price/unrealized values remain unknown. Mixed-instrument summaries are incomplete. Transient metadata carries source, observation ID, timestamp and age; the standard view's transaction-price fallback is explicitly labeled an estimate.

## Verification

Yoga7X-Eivind / Windows ARM64, Node 24.21.0, Yarn 1.22.22, installed Edge 154.0.4258.53. Browser tests use synthetic records in fresh nonpersistent contexts at `127.0.0.1:3100`, across UTC/en-US, Los Angeles/en-US and Oslo/nb-NO.

- All 8 Jest suites / 150 tests passed. Coverage includes the worked comparison, multiple accounts, fractional units, repeated partial/full sales, close/rebuy, fees/cash reconciliation, permutation/input immutability, historical cutoff, invalid/oversold/ambiguous ledgers, missing/future/stale/conflicting quotes and decimal display rounding. Existing legacy fee expectations remain characterization tests, not policy endorsements.
- Backup unit tests compare the complete trial report before/after a normal-format round trip. Browser backup tests compare displayed trial metrics after export, fresh-context restore and re-export; all four persisted collections remain identical.
- `yarn build`: passed (20.44 seconds), including framework checks and generation of `/experiment`.
- `yarn typecheck`: passed (151.34 seconds); `yarn lint`: passed without warnings/errors.
- `PLAYWRIGHT_CHANNEL=msedge yarn test:e2e`: all 81 cases passed (69.33 seconds), including 24 trial cases, six account/quote isolation cases and all 51 existing transaction/backup cases. Trial metrics survive export and fresh-context restore in every timezone project.
- `git diff --check`, new-file whitespace checks and `actionlint`: passed. The test server stopped and port 3100 was free afterward.
- Frozen offline installation from the local Yarn cache passed; the lockfile hash remained unchanged.

The first browser run passed 75/81 cases. Its six failures were two new test issues repeated across locales: rendered-text versus DOM-text comparison, and Edge's normalization of zero seconds in a datetime input. Assertions now use rendered text consistently and a canonical minute-only value. No application behavior was changed to satisfy those failures.

Persisted record fields, database version and backup/recovery formats remain unchanged. The only added price metadata is in the in-memory calculation interface. `decimal.js` 10.4.3 was already in the lockfile transitively and is now pinned as a direct runtime dependency; no package version upgrade was introduced.

## Remaining limits

The final policy decision remains open. No schema migration, same-day order field, currency/FX support, corporate actions, transfers, dividends, shorts or tax treatment is introduced. Decimal calculations cannot recover precision already lost in stored JavaScript numbers; display rounding and stale thresholds remain trial choices. Standard-view legacy fee/historical-row semantics are preserved for comparison.

This record captures local verification before publication. Remote CI results belong to the exact PR head's checks; other browser engines, manual accessibility/visual review and a fresh security audit were not part of local verification. Existing Next/NextUI SSRProvider/Browserslist warnings and security debt remain. The owner subsequently authorized a draft PR for testing or parking the experiment, without policy adoption, issue closure, merging or deployment.
