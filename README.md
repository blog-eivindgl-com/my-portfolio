# My Portfolio

A local-browser portfolio prototype built with Next.js, React, NextUI and Dexie/IndexedDB. Current functionality covers accounts, instruments, buy/sell entry and per-ticker transaction summaries. Portfolio-wide reporting, validated corrections, backup/restore, migrations and OneDrive/Google Drive sync are planned in [the roadmap](https://github.com/blog-eivindgl-com/my-portfolio/issues/14).

## Reproducible setup

Use **Node.js 24.21.0 LTS** (also in `.nvmrc`) and **Yarn 1.22.22**. Node's official distribution includes npm, which can install the exact Yarn version:

```sh
node --version
npm install --global yarn@1.22.22
yarn --version
yarn install --frozen-lockfile --non-interactive
```

Use `nvm install` / `nvm use` where your version manager supports `.nvmrc`, or install the matching release from [nodejs.org](https://nodejs.org/download/release/v24.21.0/). Do not disable engine checks. Commit `yarn.lock` alongside intentional dependency changes; do not introduce a second package-manager lockfile. After a populated Yarn cache, installation can also be checked with `--offline`.

The lockfile fixes an older inconsistent `@react-types/shared` entry. PostCSS is an explicit peer dependency and Jest typings are explicit development inputs. The matching SWC WASM package is locked because Next 13 prefers WASM on Windows ARM64; tests/builds must not download a compiler after dependency installation. This package is portable JavaScript/WebAssembly, with no OS/CPU restriction or install script, not a Windows native binary. Next's existing optional native packages still select Linux x64 and Windows x64 compilers on those platforms. Inter and its license are bundled in `src/app/fonts`, avoiding Google Fonts requests during builds.

## Commands and automated checks

```sh
yarn dev
```

Open `http://localhost:3000`. Run checks individually or with `yarn check`:

```sh
yarn typecheck
yarn lint
yarn test
yarn build
```

`yarn test` exits after one run; `yarn test:watch` is the opt-in watch mode. Lint fails on warnings. Type checking works before Next has generated `next-env.d.ts` or `.next`: `src/next-types.d.ts` supplies framework declarations explicitly.

Tests use a fixed clock (19 May 2023, 12:00 UTC) and UTC timezone in Jest config. Date-order assertions use stored timestamps rather than localized UI strings, so the suite does not require a particular operating-system locale. This preserves existing financial expectations; it does **not** certify their correctness. Real-timer integration tests should explicitly select `jest.useRealTimers()`.

`.github/workflows/ci.yml` runs frozen installation, typecheck, lint, tests and a production build on Ubuntu 24.04 and Windows 2025, then checks tracked-file cleanliness. Linux also runs the isolated browser tests below. Official Actions are pinned to commit IDs, permissions are read-only, and no deployment or secrets are needed. GitHub-hosted runs require pushing this branch/a PR; baseline verification is recorded in [docs/verification/issue-15.md](docs/verification/issue-15.md).

Transaction-entry tests cover validation, the persistence boundary and form behavior. Browser tests use fresh, nonpersistent contexts and synthetic data at `http://127.0.0.1:3100`, across UTC, Los Angeles and Oslo time zones/locales:

```sh
yarn playwright install chromium
yarn build
yarn test:e2e
```

On Linux, use `yarn playwright install --with-deps chromium` when system browser dependencies are missing. An installed Edge can be used with `PLAYWRIGHT_CHANNEL=msedge`; this still creates isolated contexts and does not open your personal profile. Leave port 3100 free: Playwright starts and stops its own production server. See [issue-8 verification](docs/verification/issue-8.md) for tested platforms and limits.

## Transaction entry

Select an existing account and enter a complete trade date. Quantity and price must be finite and greater than zero; fees must be finite and nonnegative (default zero). Fractional units are supported. Use either `.` or `,` as a decimal separator, without thousands separators; for example, `1,250` means 1.25, not 1250. Exponents and hexadecimal input are rejected. Stored values remain JavaScript numbers; this is not a decimal-money or accounting-policy implementation.

The initial date is the browser's local calendar day. A trade date is stored in the existing numeric format at UTC midnight and displayed as a UTC calendar day, so it does not shift across devices/time zones. Existing records are not rewritten; their UTC calendar day is displayed even if a historical timestamp is not midnight.

The write service rechecks account/instrument existence atomically. Failed saves preserve input and allow retry. Successful saves require choosing **Create another transaction** before another trade can be entered. Retries reuse a save ID; a new transaction or an edit after failure gets a new ID. Two deliberate, otherwise identical trades remain separate records. These are local submission safeguards, not a persistent sync queue.

## Deployment target and origin

The baseline target is a **Next.js Node server**, not static export:

```sh
yarn build
yarn start --hostname 127.0.0.1
```

Runtime instrument routes are resolved from browser IndexedDB; no build-time database enumeration is required. `next start` requires the build and production dependencies. Choose hosting and a stable public HTTPS origin before deployment or OAuth registration; neither is configured by this change. Changing scheme, host or port changes the browser storage origin and does not move existing data. The localhost command binds only to the local computer for verification.

## Architecture and data safety

- `src/app/database`: Dexie database `my-portfolio`, currently version 1; `stocks`, `accounts`, `transactions`, `stockPrices`.
- `src/app/services`: validated transaction writes, database reads, price lookup and transaction calculations.
- `src/app/viewmodel`: transaction/summary presentation values.
- `src/app/accounts` and `src/app/stock`: browser forms and pages using live queries.
- `test-fixtures/database`: synthetic historical layouts for future migration work; these are not an implemented import/export interface.

Only this browser profile/origin holds the current records. There is no implemented backup, cloud synchronization, migration or recovery workflow. Do not clear site storage, switch origins, or load fixtures into a real portfolio expecting recovery. Use isolated browser profiles and synthetic data for development. Recovery and migration implementations are tracked in #16 and #9; do not treat fixture capture as evidence that migrations are supported.

## Known correctness and maintenance limits

- Creation now validates account selection, dates and transaction inputs. Existing-record editing remains dependent on #9's revision/outbox architecture; historical malformed records are not repaired or reassigned. Account isolation, historical pricing and fee policy remain in #17. Passing input tests does not certify financial calculations.
- Next.js 13.4.2 and the beta NextUI stack are retained to keep this change scoped to the build baseline. Next.js 13 is [outside the supported release policy](https://nextjs.org/support-policy).
- The 4 October 2026 registry audit reports critical and high dependency advisories. See the verification record for counts and interpretation. This baseline is **not a security-approved production release**. A supported framework/UI and transitive-dependency upgrade must precede public/authenticated rollout; the security/release work is tracked in #22 and #23.
- `yarn audit --json` is a separate online maintenance check and currently exits nonzero. It is not silently treated as a passing CI check. No automatic audit fixes, browser-data access or cloud credentials are part of this setup.
