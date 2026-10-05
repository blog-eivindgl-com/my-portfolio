# Revision-safe account and instrument names (issue 9)

Current schema-4 behavior is documented in [Native instrument identity](native-instrument-identity.md). The older contracts below describe their original implementation stage.


Base: main `b93b057cb5df5b67d25590899e630adfb35ec53b`, containing merged PR #29. Local branch: `feat/issue-9-safe-name-corrections`. This bounded follow-up extends the repository's atomic revision/history model to account and instrument display-name corrections. It does not adopt PR #27's undecided accounting policy or implement cloud sync.

## Scope and user workflow

The account and instrument lists expose **Edit name**. The editor loads a consistent name, canonical entity ID, revision and dataset ID. Only the name is editable; account ID/ticker and all transaction/price references remain unchanged. Names must be nonempty text. Exact entered whitespace and Unicode are preserved; duplicate display names remain distinct records and are not deduplicated or merged.

**Back to accounts/instruments** before saving discards the draft without writes. A storage failure retains the name for retry. A successful save disables repeated submission. Another tab's rename or a changed dataset after restore blocks the stale command, preserves input, and requires **Reload latest and discard my edits**. Missing or inconsistent identity evidence is refused without creating new IDs or repairing storage.

## Local persistence contract

- `getNamedEntity` reads domain/identity/dataset state together. `renameAccount` and `renameInstrument` accept a name plus command ID, dataset ID, canonical entity ID, record key and expected revision; they do not accept record patches or reassignment fields.
- A write checks dataset, durable retry receipt, current identity/revision and sequence allocation before committing the renamed record, revised entity, immutable before/after operation and incremented device sequence in one seven-store transaction.
- Identical command retries return the original receipt even after a later rename or restart. A reused command ID with a different intent/store fails. Competing commands from the same base revision cannot both succeed. Unchanged submitted names still create one revision; retries do not.
- New `rename` operations use `operationVersion: 3`. Existing create/baseline and transaction-correction operations remain unchanged. Operation versions describe local operation shapes, not the IndexedDB schema or a finalized cloud wire format.
- Schema 3 and backup format 3 are unchanged: names already exist in the supported records. No migration, reset, identity remapping, guessed currency, or inferred trade chronology is introduced. Prior schema-3 code can read the renamed domain data; it has no rename/replay capability. Do not connect a sender to this provisional outbox.

## Backup and restore

Normal backup preserves renamed records, stable identities and transaction references. Ordinary merge blocks same-identity/different-name conflicts instead of overwriting a corrected name. A rename after a restore preview invalidates that preview, including its recovery confirmation. A restore that changes state still forks a dataset and replaces command/audit history with a baseline, so an old pre-restore rename command is rejected even if the restored name happens to match.

Portable backups deliberately omit local operations/history/receipts. Transaction tombstones and their format-2/format-3 compatibility remain as specified in [transaction corrections](transaction-corrections.md). Existing recovery-only limitations remain; no automatic repair or ambiguous remapping is added.

## Remaining issue 9 work

This does not complete issue 9. Remaining work includes native UUID-keyed instruments with optional ticker and explicitly chosen share/fund/currency metadata; reviewed historical numeric/order remapping and recovery; additional domain commands such as price management; and agreed integrity/replay contracts. Account/instrument deletion, ticker changes, reassignment, operation pruning, causal remote conflict resolution and provider transport are not included. Financial policy, combined-ledger validation and cloud synchronization remain separate dependent work. All tests use isolated synthetic data.

See [verification](verification/issue-9-names.md) for commands and evidence.
