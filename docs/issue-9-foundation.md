# Issue 9: independent storage foundation

This local branch starts from main `5ed6901f13cade931b026448331ac89d035ba96b`. Draft PR #27 remains parked; none of its calculation changes or fee policy are adopted. This is a first slice of #9, not completion of its event-store/sync architecture.

## Implemented boundary

- All existing application domain writes use a repository or the atomic restore service: account creation, instrument creation, transaction creation, and restore. There is no new editing/deletion UI or price-entry command.
- Version 2 adds `entityStates`, `localState` and `outbox`. The four domain stores and their numeric values/references remain unchanged. Sidecar UUIDs provide canonical stable entity identities while current routes/records continue to use legacy account IDs/tickers. This compatibility boundary avoids rewriting calculations; removing ticker-as-key constraints is still future work.
- A `create` operation, domain record, entity revision and device sequence update commit in one transaction. Retrying the same legacy save identity and identical values is a no-op; conflicting values are rejected. Separate connections serialize allocation using the shared `localState` store and a unique `[deviceId+sequence]` index. IDs never depend on record counts.
- A new database or supported v1 migration creates one complete baseline operation. A stable browser device ID and sequence survive restart. Operations are durable local pending records; there is no transport, acknowledgement/pruning, hash chain or replay engine.
- `operationVersion: 1` versions the local operation shape, **not a finalized cloud wire protocol**. Each creation has a stable operation/entity UUID and `baseRevision: null`; update/delete base-revision checks and tombstones remain future work. A baseline establishes all entity revisions at once. Creation payloads contain domain records and their canonical identity mapping.
- Synchronization sequence/createdAt are separate from domain trade dates. `tradeOrder`, `currency` and `instrumentKind` remain null. No historical order, currency or accounting policy is inferred.

## Migration and recovery

The supported current string-ID/ticker-key v1 dataset upgrades atomically after strict validation, preserving all domain fields. Numeric-ID and historical ordered variants are refused without reset or deletion; malformed/unknown fields are likewise retained for reviewed recovery. A failed upgrade keeps v1 and can be retried after the cause is resolved. Newer database versions cannot be opened by this older schema.

Schema version 2 is not downgrade-compatible with old main or parked PR #27. Use a separate browser origin/profile for development; switching Git branches does not roll IndexedDB back. No actual user browser/profile data was accessed or migrated during this work.

Backup format 2 deliberately rejects format 1, as authorized for test data. It carries canonical identities and source revisions but excludes another device's pending queue. Any restore that changes records forks a new dataset, retains stable entity IDs, creates new baseline revisions and atomically substitutes one complete local pending baseline. An identical merge is a no-op. Local device identity and sequence are retained. See [backup contract](backup-restore.md) before using restore. This is not connected-device recovery semantics.

## Still required for issue 9 and dependent work

- Reviewed remapping/migration for historical numeric IDs/order variants, richer malformed datasets and larger data limits.
- Native UUID-keyed instruments/relationships, optional ticker, explicit share/fund and currency entry/validation. Sidecar null fields do not implement these product features.
- Update/delete commands, tombstones, causal/base revision conflict checks, immutable operation replay, acknowledgements, retention and full sync consistency. The creation-only outbox is not a complete event-sourced application.
- Cross-device identities/protocol, semantic conflicts, edit/delete resolution and combined-ledger validation (#19); encryption/recovery decisions before wire format; provider adapters remain untouched.
- Integration with any later accepted calculation policy (#17). Its dependency still applies to completion/release, even though this foundation can be developed independently.

Never enable a cloud sender directly on this provisional local outbox. The owner authorized publishing this first slice as a draft PR for review. No real data reset, policy adoption, merge or deployment is included.
