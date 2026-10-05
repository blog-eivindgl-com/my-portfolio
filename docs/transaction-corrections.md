# Transaction corrections and deletions (issue 9, local slice)

Current schema-4 behavior is documented in [Native instrument identity](native-instrument-identity.md). The older contracts below describe their original implementation stage.


Base: main `de572249de826620158a17d1e6a226578ea14c9c`. The local branch `feat/issue-9-transaction-corrections` implements transaction-only corrections/deletions. PR #27 remains parked; no calculation or fee policy is adopted. There is no cloud transport, replay, account/instrument reassignment, or account/instrument deletion.

## User workflow

Use **Edit / delete** on a transaction row. The editor loads a consistent record and revision. Change type, trade date, optional time, description, quantity, price or fee, then save. Account, instrument and transaction identity stay fixed. Unedited amounts and description whitespace are preserved. Missing time stays absent, explicit `00:00` stays midnight, and equal/missing same-day times still leave calculations unavailable. No timezone conversion or authoritative intraminute ordering is invented.

Deletion requires **Delete transaction**, then **Confirm deletion**. **Cancel deletion** and returning to the list before saving write nothing. A failed write preserves the draft and allows retry; success disables repeat submission. A stale edit/delete preserves input and requires **Reload latest and discard my edits**. If the record was deleted, reloading reports that it is unavailable. There is no automatic conflict overwrite or undelete button.

## Persistence contract

`PortfolioRepository.getTransaction` reads the record, canonical identity/revision and dataset ID in one transaction. Update/delete commands contain a UUID command ID, dataset ID, entity ID, transaction ID and expected revision. All writes cover the seven stores in one IndexedDB transaction:

1. Require the same dataset; a pre-restore command cannot act on the replacement dataset.
2. Check the durable command receipt first. Identical retries return the original result, even after later edits/deletion. Reusing an ID for different values or intent fails.
3. Require a live transaction with matching identity and revision. Competing commands from the same revision cannot both succeed.
4. Save the corrected domain row, or remove it and retain its `entityStates` tombstone; append an operation; update the revision and device sequence atomically.

New correction operations use `operationVersion: 2` and contain the exact command, prior record, replacement record (or null), entity state and base revision. Baselines containing tombstones also use version 2; existing version-1 create/baseline operations remain intact. A successful update, including unchanged submitted values, creates one revision; a retry does not. Deleted legacy IDs remain reserved, so creation cannot resurrect them.

History and retry receipts persist across restart and are not pruned. They remain local outbox records, not a finalized remote protocol or an audit-history UI. Changing restore deliberately replaces that history with a new baseline; see below. Dates and trade times remain independent of operation sequence and wall-clock creation timestamps.

## Schema and recovery

Schema 3 retains the same seven stores. Supported v2 databases upgrade after validating records and identities, without rewriting records, IDs, revisions, device sequences or operations. Supported v1 databases pass through the existing baseline migration. Unknown stores/identity layouts and invalid data are refused; failed upgrades retain the prior database. Older application schemas cannot open schema 3. Use a separate development profile/origin; changing Git branches does not downgrade IndexedDB.

Normal exports now use backup format 3 / database version 3. Valid format-2 files remain readable and are upgraded in memory; format 1 and unknown/newer versions are rejected. Only transaction identities may be tombstones. A tombstone has no live transaction row, retains its stable identity and record key, and counts toward the 100,000-record limit. Duplicate keys/UUIDs, missing live metadata, and live-row/tombstone combinations are rejected. The 10 MiB limit still applies.

- **Merge** never deletes or resurrects a live/deleted identity conflict. It blocks application and preserves current state. An incoming marker for an otherwise absent transaction is retained, even when no live rows change. Matching existing markers remain unchanged. This is conservative snapshot merge, not causal conflict resolution.
- **Replace** explicitly starts new-dataset recovery, replacing domain rows and markers with the backup's state. An older live backup can therefore restore a previously deleted transaction. The UI discloses this before the required confirmation and recovery download.
- Any changing restore preserves entity identities and markers but assigns new baseline revisions and a new dataset ID, retains local device/sequence state, and replaces old operations with one baseline. An identical merge is a no-op. Preview staleness checks include markers and metadata.

Portable backups preserve active records and deletion identities, not deleted record bodies, local audit history, command receipts or device credentials. Before/after bodies remain in local history until a changing restore. The separate recovery-only archive still excludes foundation stores and cannot preserve tombstones/history or be directly imported. Retain the original profile when normal export fails; it is not an exact recovery substitute.

## Limits

This slice does not validate account balances against an approved oversell/cost-basis policy. Editing or deleting a historical trade can change later balances; the existing calculation limitations remain. There is no history pruning, tombstone expiry, remote merge, undo, provider authorization, or historical numeric-ID remapping. No actual portfolio, browser profile or cloud-drive data is used for development/tests.

Verification is recorded in [the local verification record](verification/issue-9-corrections.md).
