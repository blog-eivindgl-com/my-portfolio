# Issue #8: transaction creation validation

Base: merged `main` at `90b3a1951569930cb6f1604d74d7be9f903de7f2` (PR #24). Local branch: `fix/issue-8-transaction-validation`. Date: 4 October 2026. No production records or personal browser profile were opened.

## Implemented scope

- Controlled, labeled account selection stores the selected ID. Loading, empty-account and load-failure states have explicit feedback; failed account loads can be retried.
- Shared runtime validation accepts only Buy/Sell, an existing account/instrument, complete calendar dates, positive finite quantity/price and finite nonnegative fees. Decimal comma/point and fractional units are supported; grouping, hexadecimal and exponent syntax are rejected. Whitelisted fields are persisted; unknown properties are discarded.
- Local-calendar default dates are initialized after hydration. Calendar dates persist as UTC-midnight numeric timestamps, with UTC calendar display. This retains database version 1 and does not rewrite historical records.
- An atomic Dexie transaction validates references and adds the record. Same-ID/same-payload retries are idempotent; a different payload cannot overwrite that ID. Independent save IDs permit legitimate identical trades.
- A synchronous pending guard and success lock prevent accidental double submissions. Errors retain input. Retry without edits retains its ID; edits after failure and explicit new transactions allocate a new ID.
- Form layout uses native accessible labels/controls, field errors, a feedback summary and explicit save/new-transaction actions.

## Validation evidence

Environment: Yoga7X-Eivind, Windows ARM64, Node 24.21.0, Yarn 1.22.22. Synthetic fixtures are defined in the Jest and Playwright test files; no exported portfolio is used.

- `yarn typecheck`: passed.
- `yarn lint`: passed, no warnings/errors.
- `yarn test`: 4 suites / 81 tests passed, including the seven unchanged financial-calculation expectations.
- `actionlint`: passed for the updated CI workflow.
- `yarn build`: passed (184.31 seconds), including production compilation, framework type/lint checks and page generation.
- `PLAYWRIGHT_CHANNEL=msedge yarn test:e2e`: all 21 scenarios passed (21.8 seconds) against the production server using Edge 154.0.4258.53 / Playwright 1.63.0. Seven scenarios run in each of UTC/en-US, America/Los_Angeles/en-US and Europe/Oslo/nb-NO. They cover local-day defaults, UTC date display and persisted reads after reload, fractional input and actual account ID, invalid/missing fields, double submit plus legitimate identical trades, injected quota-style failure with unchanged and edited/sell retries, and deleted account/instrument references.
- `yarn install --frozen-lockfile --offline --non-interactive`: passed against the populated local cache without changing the lockfile.
- `git diff --check`: passed. These are local verification results; the pull request records hosted CI results against its published head.

The initial browser run had 9 passes and 12 ambiguous-alert selector failures: Next.js supplies a route-announcement alert in addition to the form alert. Scoping assertions to the named form resolved the ambiguity; the complete final 21-scenario run passed without changing application behavior or weakening error assertions.

Known baseline warnings remain visible: outdated Browserslist data, NextUI SSRProvider notices, and legacy Node API deprecations. No dependency-security clearance is claimed.

The initial component-test stall came from switching to real timers after modules were initialized under globally enabled fake timers. Keeping component tests on the configured fake clock resolved all five stalled tests. Fake IndexedDB integration tests use real timers in their separate Node environment.

## Review boundaries and remaining work

- This delivers the creation/validation portion of #8. Its existing-record edit criterion remains blocked on #9's revision/outbox design; do not mark the whole issue complete on this evidence.
- Historical malformed records are neither silently reassigned nor repaired. A review/correction workflow and migration handling remain future work.
- No schema migration, backup/restore, persistent outbox, cross-device synchronization, provider authorization or encryption is introduced.
- Numeric storage remains IEEE-754 JavaScript numbers. Currency precision, rounding, overselling, account-separated calculations, price history and fee policy remain #17 work. The existing calculation tests passing does not establish those policies as correct.
- In-memory save IDs guard one mounted form's retries, not recovery after tab/process loss. IndexedDB commit and success feedback are awaited; recovery across sessions belongs to the persistent outbox work.
- Existing Next 13 / beta NextUI advisories and previously recorded dependency maintenance risks remain. No public/authenticated rollout is approved by these checks.
- CI browser coverage is added for Ubuntu Chromium. Windows CI retains lint/unit/integration/build checks. Consult the pull request's exact-head checks for remote results.
- Not run here: WSL/Linux execution, Firefox/WebKit/Safari, manual assistive-technology or visual review, actual disk-exhaustion/device-crash recovery, security audit rerun, or cloud synchronization. Storage failures were injected using synthetic data; personal data and cloud contents were never accessed.
