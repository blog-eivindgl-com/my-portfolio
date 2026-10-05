# PR #27: confirmed fees and instrument tabs

5 October 2026. Starting head `50dff41b159a2aae14719c2ab8dd7728a0c7ff57`; main `f5a0fe5a7348b782998c2c1732ec827a872984c1`. Both remote refs were verified before changes; the checkout was clean. The owner explicitly confirmed the fee-at-each-sale rule and authorized replacing the experiment with Combined and Per account tabs in the main view.

The retained pure decimal engine now excludes buy fees from unit cost, charges the full pending fee balance plus the sale fee at every sale, and resets that balance. The combined and account views share the calculated rows. The grid preserves the sale fee boundary. Quote validation, explicit cutoff semantics, chronology guards, UUID identity and nullable metadata are retained. The `/experiment` route, navigation and obsolete proportional-fee documentation/tests have been replaced.

Schema, portable backup format, migrations, write repository, correction/rename/delete operations and history validation are unchanged. Synthetic tests compare all eight stores across tab navigation and reload, including tombstones and history after another-tab edits.

## Verification

All data is synthetic, using fresh nonpersistent browser contexts. No actual portfolio, user browser profile or cloud-drive data is accessed.

- Full unit suite: 342 tests in 18 suites passed, including fee reset sequences, pending-fee cash reconciliation, per-account isolation, presentation equivalence and all base integrity/migration/backup/correction suites.
- Standalone typecheck passed after regenerated route types removed the old experiment reference. Strict lint and the final production build passed; the existing NextUI SSRProvider warnings remain.
- Full Edge browser run: 210/216 passed (4.7 minutes). One new selector matched both the validation alert and the hidden Next.js route announcer; it is now scoped to the message. An existing regression caught additional wording on the ambiguous-instrument message; main's original wording is restored. Both corrected cases passed in all three targeted timezone reruns (6/6, 11.4 seconds).
- All 216 cases are covered across UTC/en-US, Los Angeles/en-US and Oslo/nb-NO, including keyboard tab navigation, identical rows/totals, fee boundaries, live edits/renames/deletion, cancellation, snapshots of all eight stores, cutoff/quote limitations, backup round trips and all base migration/correction regressions.
- Whitespace checks passed. Remote PR head and main were rechecked unchanged before publication. Exact-head remote CI is reported on the PR.

See [calculation behavior](../instrument-calculations.md). The PR remains draft for review; issues are not closed and no merge or deployment is requested. Existing Next/NextUI build warnings and framework/security debt remain outside this change.
