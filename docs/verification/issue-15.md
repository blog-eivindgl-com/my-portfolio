# Issue #15 — reproducible build verification

Date: 4 October 2026. Repository baseline:
`efb1b244f91393c75a6aa20a7be4672b2a48e488` (verified latest `origin/main`).
Local branch: `chore/issue-15-reproducible-build`.

Local tests ran against that baseline plus the changes in this branch, before
publication. The pull request identifies the committed head and current hosted
CI results; this record describes the local verification performed beforehand.
No deployment or issue completion is claimed.
Verification was performed on YOGA7X-EIVIND, Windows ARM64, with Node 24.21.0
LTS and Yarn 1.22.22. Official Node archive SHA-256 and Yarn registry SHA-512
integrity were checked before use; tools were placed in the task workspace,
without a global installation or security-setting change.

## Original baseline findings

| Check | Original result |
| --- | --- |
| Frozen install | Installed, but warned that exact `@react-types/shared@3.15.0` incorrectly resolved to 3.18.0 in the lockfile |
| Jest | 6 passed, 1 failed: English `5/8/2023` did not match hard-coded Norwegian `8.5.2023` |
| Typecheck before build | Failed: missing CSS-module declarations before generated `next-env.d.ts` existed |
| Lint | Passed |
| Production build | Failed when the build-time Google Fonts request was unavailable |

Source inspection also identified build-time IndexedDB enumeration in the client
transaction route. Removing `generateStaticParams` leaves dynamic ticker routes
served by the Node server without reading a browser database during the build.

## Changes made

- Pin Node/Yarn, preserve the Yarn v1 lockfile, repair its incorrect shared-types
  entry, and declare the PostCSS peer and Jest typings explicitly.
- Add standalone typecheck, nonwatching tests, opt-in watch mode and zero-warning
  lint; preserve the existing financial expectations.
- Freeze the Jest clock/timezone and assert transaction order using numeric dates,
  avoiding operating-system display-locale assumptions.
- Supply Next type declarations before any generated files exist.
- Bundle the Inter variable font and OFL license; use `next/font/local`.
- Pin `@next/swc-wasm-nodejs@13.4.2` to avoid Next's undeclared compiler download
  on Windows ARM64. This is portable JavaScript/WebAssembly, with **no `os` or
  `cpu` restrictions and no install script**. It is not a Windows native package.
  Next still declares Linux x64 and Windows x64 compilers as optional native
  dependencies; their selection remains unchanged. Making this WASM development
  dependency optional would allow a failed install to reintroduce on-demand
  downloads on the verification platform.
- Add pinned official GitHub Actions for Ubuntu 24.04 / Windows 2025, read-only
  permissions, clean frozen install, all checks, and tracked-file drift detection.
- Capture three synthetic historical database layouts for #9, without claiming a
  migration or export/import implementation. Document setup, architecture, origin
  semantics, recovery limitations and the Node-server deployment target.

## Verification results

Working-checkout typecheck, lint, seven tests and production build passed.
The seven tests also passed under both `en-US` and `nb-NO` default locales. Both
hosts reported Europe/Oslo before Jest explicitly selected UTC; the test clock
was 19 May 2023, 12:00 UTC.

A fresh source-only copy was created without `.git`, `node_modules`, `.next`,
`next-env.d.ts` or TypeScript build caches. Commands use the same pinned toolchain
as the workflow. Its install used a populated verified Yarn cache and **offline
mode**, not a reused dependency directory.

| Fresh-copy command | Result |
| --- | --- |
| `yarn install --frozen-lockfile --non-interactive --offline` | Passed, 8.4 seconds |
| `yarn typecheck` | Passed before build-generated files existed, 143.79 seconds |
| `yarn lint` | Passed, no warnings/errors, 17.2 seconds |
| `yarn test` | Passed: 1 suite / 7 tests, 14.21 seconds |
| `yarn build` | Passed, 169.03 seconds; lockfile unchanged after all checks |

The working-checkout production build passed in 162.52 seconds; standalone
typecheck took 132.64 seconds. These checks are relatively slow with the retained
UI typings. They were allowed to finish rather than bypassed.

`actionlint 1.7.12 .github/workflows/ci.yml` passed with exit 0. The official
release archive checksum was verified. The fixture files were parsed and their
account/instrument references and numeric values checked. `git diff --check`
passed. No browser profile or actual portfolio was inspected.

The fresh production build was started with
`next start --hostname 127.0.0.1 --port 3100`. HTTP smoke checks returned **200**
with expected page text for `/`, `/accounts`, `/stock`,
`/stock/transactions/SYNTH`, and `/stock/transactions/SYNTH/create`. The font
referenced by the generated stylesheet returned **200**, `font/ttf`, 876,576
bytes from the same loopback origin; HTML/CSS contained no Google Fonts endpoint.
The smoke test checks server rendering and asset delivery, not browser hydration
or IndexedDB writes. Only the synthetic ticker `SYNTH` was used. The temporary
server was stopped after verification.

## Dependency assessment — release blocker remains

`yarn audit --json`, 4 October 2026, exited **30**. Registry summary across 788
dependencies: **16 critical, 241 high, 115 moderate, 29 low** findings. These are
dependency-path occurrences, not 401 distinct exploitable application flaws.
Deduplicating advisory IDs gives **98 advisories: 5 critical, 46 high, 39 moderate,
8 low**. The legacy manifest lists much build/test tooling under `dependencies`,
so these counts are not a production-exploitability assessment.

Actionable follow-up for #22/#23, before public or authenticated rollout:

1. Move to a supported Next.js release together with matching `eslint-config-next`;
   official npm `latest` was **16.3.8** for both at verification time. Confirm React,
   TypeScript and beta NextUI compatibility in that separate upgrade. The pinned
   Node runtime meets Next 16's published `>=20.9.0` engine requirement. Re-run the
   audit against the chosen versions; do not merely patch one historical advisory.
2. The audited Next Windows-server and AVIF-image critical advisories list
   **15.5.24** as their minimum fixed branch version. This is an advisory floor,
   not a recommendation to retain unsupported Next 13 or an assertion that one
   version fixes every current dependency issue.
3. Refresh transitive Babel and form-data chains through their owning packages.
   The reported critical ranges cite `@babel/traverse >=7.23.2` and
   `form-data >=4.0.4` respectively. Avoid blind forced overrides across major
   versions; rerun build, tests and audit after the compatibility upgrade.

Sources:

- [Next.js support policy](https://nextjs.org/support-policy)
- [Next registry metadata](https://registry.npmjs.org/next/latest)
- [Windows server advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [AVIF image advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)
- [Babel advisory](https://github.com/advisories/GHSA-67hx-6x53-jw92)
- [form-data advisory](https://github.com/advisories/GHSA-fjxv-7rqg-78g4)

No automatic audit fixes or broad framework upgrade were included in #15.
The audit is explicitly non-passing and is not represented as a green CI check.

## Remaining coverage and readiness limits

- Local execution covers **Windows ARM64 only**. Ubuntu x64 and Windows x64 are
  configured in CI but had not run at local verification time. Portable
  WASM metadata and unchanged native optional-dependency selection are evidence
  of intended compatibility, not a substitute for those runner results.
- Build output retains legacy React Aria `SSRProvider` warnings and an outdated
  Browserslist database warning. These are visible, not suppressed. Review UI
  hydration/accessibility and refresh browser data during compatibility work.
  Yarn 1 also reports Node's `DEP0169` URL-parser deprecation.
- Hosting provider and stable public HTTPS origin remain deployment decisions.
  This change proves a local Node-server build, not a deployment.
- Account-entry, account-isolation, valuation and fee-policy defects remain in
  #8/#17. Existing tests characterize legacy behavior; no new financial policy or
  migration behavior has been implemented.
- No real-browser hydration, IndexedDB migration, cloud authorization or sync
  integration tests are claimed. They belong to the later roadmap issues.

The baseline is suitable for code review and hosted CI execution, **not a
security-approved release**. Consult the pull request for results on its exact
published head; issue #15 remains open pending review.
