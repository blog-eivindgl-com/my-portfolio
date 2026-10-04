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

`.github/workflows/ci.yml` runs frozen installation, typecheck, lint, tests and a production build on Ubuntu 24.04 and Windows 2025, then checks tracked-file cleanliness. Official Actions are pinned to commit IDs, permissions are read-only, and no deployment or secrets are needed. GitHub-hosted runs require pushing this branch/a PR; local verification is recorded in [docs/verification/issue-15.md](docs/verification/issue-15.md).

## Deployment target and origin

The baseline target is a **Next.js Node server**, not static export:

```sh
yarn build
yarn start --hostname 127.0.0.1
```

Runtime instrument routes are resolved from browser IndexedDB; no build-time database enumeration is required. `next start` requires the build and production dependencies. Choose hosting and a stable public HTTPS origin before deployment or OAuth registration; neither is configured by this change. Changing scheme, host or port changes the browser storage origin and does not move existing data. The localhost command binds only to the local computer for verification.

## Architecture and data safety

- `src/app/database`: Dexie database `my-portfolio`, currently version 1; `stocks`, `accounts`, `transactions`, `stockPrices`.
- `src/app/services`: database reads, price lookup and transaction calculations.
- `src/app/viewmodel`: transaction/summary presentation values.
- `src/app/accounts` and `src/app/stock`: browser forms and pages using live queries.
- `test-fixtures/database`: synthetic historical layouts for future migration work; these are not an implemented import/export interface.

Only this browser profile/origin holds the current records. There is no implemented backup, cloud synchronization, migration or recovery workflow. Do not clear site storage, switch origins, or load fixtures into a real portfolio expecting recovery. Use isolated browser profiles and synthetic data for development. Recovery and migration implementations are tracked in #16 and #9; do not treat fixture capture as evidence that migrations are supported.

## Known correctness and maintenance limits

- Account selection/date/input validation remain in #8. Account isolation, historical pricing and fee policy remain in #17. Passing the existing seven tests does not resolve those defects.
- Next.js 13.4.2 and the beta NextUI stack are retained to keep this change scoped to the build baseline. Next.js 13 is [outside the supported release policy](https://nextjs.org/support-policy).
- The 4 October 2026 registry audit reports critical and high dependency advisories. See the verification record for counts and interpretation. This baseline is **not a security-approved production release**. A supported framework/UI and transitive-dependency upgrade must precede public/authenticated rollout; the security/release work is tracked in #22 and #23.
- `yarn audit --json` is a separate online maintenance check and currently exits nonzero. It is not silently treated as a passing CI check. No automatic audit fixes, browser-data access or cloud credentials are part of this setup.
