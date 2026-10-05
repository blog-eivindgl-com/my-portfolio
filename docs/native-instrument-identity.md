# Native instrument identity (issue 9)

This follow-up starts at merged PR #31 (`f64bc7816cb3ed68f121fcb93b07994e415bdba4`). It implements native instrument UUID primary/foreign keys. It does not adopt PR #27's accounting experiment or introduce cloud synchronization.

## Coordinated contracts

| Contract | Current version and behavior |
| --- | --- |
| IndexedDB | Dexie 4 (native version 40), eight stores |
| Instrument | `instruments.id` is the stable entity UUID; no `stocks` store remains after a successful upgrade |
| References | Transactions and prices use `instrumentId`; account IDs and all financial/date/time values are retained |
| Portable backup | Format 4 / database 4 only; versions 1–3 and newer versions are explicitly rejected |
| New operations | Version 4, including an explicit migration boundary |
| Historical operations | Versions 1–3 retained unchanged and checked by the frozen legacy verifier |
| Hash evidence | `operationDigests`, version 1, SHA-256 canonical content plus previous/content chain hashes |

`instruments` contains required `id` and `name`, plus nullable `ticker`, `instrumentKind` (`share` or `fund`), `currency`, `exchange`, and `isin`. Creation accepts unknown metadata as null. Currency checks uppercase three-letter syntax, not an authoritative currency registry; ISIN checks syntax, not issuer existence or checksum. Migration never infers these values from ticker/name. Tickers are nonunique labels. New links use UUIDs; old ticker links resolve only when exactly one instrument matches. UUID links take precedence over ticker lookup. Ambiguous ticker links cannot select an instrument or save a transaction.

## Atomic migration and retained evidence

Supported string-key v1 and valid v2/v3 databases upgrade in a single IndexedDB versionchange transaction. The existing identity/history verifier checks the source first. Each legacy ticker must map to exactly one validated, globally unique stable entity UUID. The converter rewrites only instrument keys and transaction/price foreign keys. It preserves dataset/device identity, entity UUIDs, revisions, deletion markers, descriptions, dates, optional times, quantities, prices and fees.

The migration appends one version-4 operation containing the validated before/after snapshots and referencing the preceding head. Historical operations are not rewritten. On restart, the verifier checks the legacy prefix against the before snapshot, recomputes the conversion, checks the after snapshot, and replays native operations. The frozen `src/app/legacy` contract deliberately remains independent of changes to native record validation; its repository/backup modules also construct historical regression fixtures.

The removed `stocks` store remains readable during Dexie's upgrade callback and is removed only after success. Failure after reference conversion or while saving digest evidence rolls the entire upgrade back, including schema changes. A clean retry starts from the intact source. Newer versions, unknown layouts, missing references, case-aliased UUIDs, invalid history and ambiguous mappings fail without reset or replacement identities.

Legacy rename/update/delete command receipts remain idempotent after migration. Their retained commands are compared through the explicit conversion boundary; they do not append duplicate operations, even after a later deletion. New mutations atomically commit domain records, identity/revision state, operation, digest and local sequence. Separate connections serialize writes using the same store transaction.

## Local integrity hashes

A digest row uses the operation ID and device sequence, a SHA-256 content hash of recursively key-sorted JSON, the preceding chain hash (null at a local baseline), and a SHA-256 chain hash over its version/previous/content fields. Legacy operations acquire digest evidence during the upgrade without changing their contents. `Dexie.waitFor` encloses the complete asynchronous digest calculation so WebCrypto cannot let the transaction commit between hashing and persistence.

Restart verifies digest count, contents and chain alongside semantic history replay. These hashes detect accidental local divergence. They are not signatures, external anchors, authenticated remote messages or remote conflict resolution. Restoring a portable backup starts a fresh local chain.

## Restore and compatibility

Format 4 exports native instrument metadata, stable entity identities and transaction tombstones. As with format 3, it is a portable snapshot, not a journal/device clone: replacement creates a new dataset, preserves stable entity IDs and tombstones, and starts a new baseline/revisions. Local histories and retry receipts survive in-place migration, not portable restore. Merge still blocks differing values/identities and deletion-marker conflicts. Restore remains atomic and requires the existing recovery-copy flow.

Old portable files are rejected explicitly rather than silently transformed. Existing supported local databases migrate automatically. Exact known numeric and ordered version-1 layouts also migrate through the adapters below; unknown variants remain refused and retained. Recovery-only archives remain evidence, not an import bypass.

## Acceptance audit and remaining issue 9 scope

| Issue 9 requirement | Result in this slice |
| --- | --- |
| Central typed mutation boundary | Existing repository/restore boundary retained; instrument creation now validates native metadata |
| Stable instrument primary/foreign keys | Implemented, including unambiguous v1/v2/v3 conversion and UUID links |
| Stable dataset/account identity | Existing UUID metadata preserved; old account record keys intentionally unchanged |
| Currency/share/fund/optional ticker | Explicit creation fields and backup validation implemented; migrated unknown values remain null |
| Domain time versus synchronization order | Existing date/optional wall-clock time preserved; operation sequence is never trade order |
| Atomic durable operations, revisions, tombstones, retry safety | Retained and tested across migration/restart/concurrent connections |
| Content hash and local sequence chain | Implemented locally; no remote protocol claim |
| Migration interruption/newer-version refusal | Verified with retained-source and clean-retry tests |
| Historical numeric/UUID/ordered fixtures | Exact known layouts migrate atomically; ambiguous/unknown variants retain their source and diagnostics |
| Supported balances and references | Numeric inputs unchanged; existing calculation regressions retained; no accounting-policy change |
| Cross-device replay/conflicts/encryption/acknowledgements/retention | Not implemented; requires the separately agreed #19 protocol |
| Accounting integration/release acceptance | #17 policy remains unresolved; PR #27 remains parked |

The locally implementable issue-9 acceptance criteria are covered by this implementation and its tests. No further historical adapter for a known unambiguous fixture is deferred. Issue closure still needs the owner to resolve the explicitly listed #17 accounting dependency. #19 transport, remote replay/conflicts, acknowledgements and retention are separate work; the local hash chain does not claim those capabilities. Metadata editing beyond existing name correction and future price-entry commands are product extensions, not missing acceptance criteria for this issue. See the verification record for actual checks and known warnings.

## Historical adapters and exact boundaries

All three historical layouts reused Dexie version 1. Detection uses actual store/key/index definitions, not version alone. The fixtures cite the original repository revisions; no schema from parked PR #27 was adopted.

| Historical layout | Accepted shape | Mapping and retained evidence |
| --- | --- | --- |
| Numeric, parent of `3a4f477` | Three stores: stocks with ticker key; accounts and transactions with numeric auto-increment id keys; exact original indexes; positive safe integer IDs and matching account references | Allocate independent account/transaction/instrument UUIDs, preserve numeric source keys in explicit mapping and original records; absent price store becomes empty |
| UUID, `efb1b24` | Existing four-store string-key schema, timestamp index but no populated unknown timestamp values; existing validator contract | Keep account/transaction/price record keys and use existing validated UUID sidecars for instruments |
| Ordered, `d2d7cc9` | Exact four-store UUID-key schema and original timestamp/order indexes; order absent or a nonnegative safe integer | Keep UUID record keys; preserve original `order` as native optional `tradeOrder`, with the original source values retained in the baseline |

Numeric/ordered adapters stage the complete source plus mapping in a temporary store, remove old primary-key stores in a separate Dexie upgrade step, and recreate native stores. All steps occur within one IndexedDB versionchange transaction; the temporary store is removed only on success. The new version-4 baseline contains `sourceMigration`, and restart recomputes its conversion before replaying later mutations. Failure after source staging or store recreation leaves the original version-1 schema and all source records intact. Two racing openers produce one baseline/mapping.

Unknown stores/indexes, mixed key types, orphaned references, extra fields, populated timestamp values with unspecified semantics, invalid numeric values, UUID aliases/collisions, duplicate count-based order per instrument, and explicit order contradicting dates are refused without reassignment. Diagnostics direct the user to recovery-only export and review. Missing order remains absent, never assigned from IDs, timestamps or device sequence. Incomplete same-day chronology is visible and calculations stay withheld until there is sufficient evidence.

Complete unique retained order resolves same-day chronology. If both clock time and order are complete but contradict each other, calculations remain blocked. Transaction corrections preserve the retained ordinal; the repository rejects changing/removing it. Format-4 backups and recovery-only archives preserve the field. The table displays it separately from clock time. No new count-based ordinal is allocated.

## Acceptance criteria audit

1. Supported datasets migrate without orphaned references or changed financial inputs: numeric, UUID, ordered, and v2/v3 history-bearing fixtures are covered; monetary values are preserved exactly and existing calculation regressions remain. This is not a claim that unresolved #17 fee/accounting policy is correct.
2. Interrupted migrations are recoverable and newer formats cannot overwrite records: atomic failure injection after stage/store replacement, clean retry, newer local schema and backup refusal are covered.
3. Each supported mutation and operation/digest/identity/sequence update commits together and survives restart; failures preserve the complete prior snapshot.
4. Separate connections and real browser tabs preserve one logical operation/UUID mapping during retries and races; IDs do not derive from counts.
5. Ambiguous historical identity/order evidence is retained with actionable diagnostics. Unknown chronology is never invented.

#16 staged export/recovery is present and exercised. #17 remains an explicit issue dependency. #19 is neither enabled nor required to claim local atomicity; remote conflict resolution still needs its own agreed protocol. Schema version, portable format version, local operation version and digest version are separate contracts even where their current numeric values coincide.
