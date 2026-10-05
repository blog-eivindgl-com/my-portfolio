# Identity/history integrity prerequisite (issue 9)

Current schema-4 behavior is documented in [Native instrument identity](native-instrument-identity.md). The older contracts below describe their original implementation stage.


Base: main `50b7c1aebc15f00e704cc6c3fc3378d8a4d2f80d` (merged PR #30). Branch: `feat/issue-9-verified-identity-history`. This local slice establishes a checked identity mapping before a future native UUID-key migration. It does not migrate instrument keys or add product metadata.

## Enforced boundary

Every database open, including queries that implicitly open a connection, waits for a read-only transaction covering all seven stores. The verifier checks the complete retained local journal against current records, stable identities, revisions, deletion markers and device/head/sequence state. A sticky Dexie ready handler repeats the check after connection restart. A supported v2 upgrade also verifies inside the versionchange transaction: failure retains schema 2 and all original evidence. Supported v1 upgrades retain their atomic baseline migration and interruption/retry behavior. Native layout inspection now covers schema 3 as well, refusing unknown stores or unsupported primary-key layouts before opening.

The verifier accepts a complete baseline followed by the existing create (operation version 1), transaction update/delete (version 2), and name correction (version 3) operations. It requires continuous local sequence numbers after that baseline, matching dataset/device IDs, unique operation UUIDs, exact command receipts, matching prior revisions and before/after bodies, immutable transaction references, and no reuse of reserved identities. Current records and metadata must equal the verified result. A restore baseline can start at a later device sequence; no discarded pre-restore history is inferred. It reports the checked ticker-to-UUID mapping and transaction/price reference counts without writing or manufacturing mappings.

UUID collisions differing only in letter case are rejected in both local verification and portable identity validation. Valid UUID spelling is preserved; identities are never normalized or reassigned. Names, exact numeric values, optional times, references, rename history and tombstones remain untouched.

## Version and recovery contract

IndexedDB remains schema **3**, portable backups remain format **3** (format 2 import supported), and operation versions remain **1/2/3**. No stored shape changes or new operations require a version bump. The verifier has a separate report `checkVersion: 1`; it is not a wire protocol. Existing schema-3 clients can still open the data but do not enforce this check.

Verification failure refuses the connection with an integrity error directing the user to retain storage. Nothing is reset, repaired or truncated. The Backup page exposes this error when normal export cannot open the database. Recovery-only export remains independent, but its existing omission of foundation stores means it is not a complete history archive: retain the original profile for reviewed recovery. Portable restore deliberately replaces local history with a new baseline; it is not audit-history restoration.

Verification is bounded to 100,000 current/baseline records plus tombstones and 250,000 retained operations. Larger histories are refused without pruning. Verification loads the journal in memory; streaming validation and large-history recovery remain future work. This is a connection-open consistency check, not continuous tamper detection, cryptographic authentication, a remote replay engine or protection against arbitrary raw IndexedDB writes after a connection opens. Future key migration must run verification and conversion together in its versionchange transaction, rather than rely on an earlier report.

## Remaining issue 9 scope

Native UUID instrument primary/foreign keys, optional ticker and explicitly supplied instrument kind/currency still require a versioned domain/schema/backup migration and route/form updates. Historical numeric-ID/order variants still require reviewed mappings; ambiguous records remain refused. Further domain commands, accepted financial policy, remote causal conflict semantics, authenticated integrity, replay/retention and cloud sync remain separate work. No PR #27 policy or issue #19 transport is adopted.

See [local verification](verification/issue-9-identity-integrity.md). All validation uses isolated synthetic data.
