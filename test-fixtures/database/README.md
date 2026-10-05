# Synthetic database history

These are synthetic inputs captured for the migration work in issue #9. They
contain no user data and are not an implemented export/import format. All three
historical layouts declared database version 1, so version alone cannot identify
the stored layout.

| Fixture | Source | Shape |
| --- | --- | --- |
| `numeric-v1.json` | Parent of `3a4f477` | Numeric auto-increment account/transaction IDs; no price store |
| `uuid-v1.json` | Main `efb1b24` | String UUID references, price store, indexed but absent timestamp |
| `ordered-v1.json` | Unmerged `d2d7cc9` | UUID layout plus transaction order |

`fixtureVersion` versions this fixture envelope. `databaseVersion` and `stores`
describe historical Dexie schemas. `records` contains consistent referenced rows
with deliberately synthetic identities. Validate remapping of account IDs,
transaction identities, absent timestamps/order, and unchanged decimal values
when implementing migrations. The ordered variant is captured for recovery;
it is not adopted as the development baseline.

No migration implementation or real-browser migration test is claimed by #15.
Do not load these into a real portfolio. Add interrupted-upgrade, malformed-data
and multi-account variants with the migration/restore implementation.

Issue #9 now tests these fixtures in the native migration adapters and browser suite. Exact numeric, UUID and ordered layouts are supported; see [accepted/refused contracts](../../docs/native-instrument-identity.md). Corrupt or unknown variants are retained without reset.
