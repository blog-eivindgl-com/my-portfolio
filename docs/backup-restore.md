# Local backup and restore

Open **Backup** from the desktop navigation or **Backup and restore your portfolio** from the home page. This page works with browser IndexedDB and downloaded files. No OneDrive/Google login or network upload is involved. JSON backups are plaintext financial data: keep the files private and retain an independent copy. Clearing browser storage is not a recovery procedure.

## Normal backup

Choose **Export backup**, then verify the downloaded JSON file exists. The app requests a browser download; it cannot prove that the operating system saved it. The export is a consistent read transaction over accounts, instruments, transactions and price observations. It includes only the documented schema and rejects unexpected record fields instead of exporting possible tokens or dropping unknown data.

The supported file format is:

```json
{
  "format": "my-portfolio-backup",
  "formatVersion": 1,
  "databaseVersion": 1,
  "exportedAt": "2024-03-02T12:00:00.000Z",
  "records": {
    "accounts": [],
    "stocks": [],
    "transactions": [],
    "stockPrices": []
  }
}
```

See [the synthetic example](../test-fixtures/backup/portfolio-v1.json). The envelope and all record objects require exactly their documented fields. Unknown/newer versions are rejected; there is no automatic migration.

| Collection | Exact record fields | Validation |
| --- | --- | --- |
| accounts | `id`, `name` | Nonempty strings; unique ID |
| stocks | `ticker`, `name` | Nonempty strings; unique ticker |
| transactions | `id`, `type`, `ticker`, `accountId`, `date`, `description`, `shares`, `price`, `brokerage` | Unique string ID; Buy=0/Sell=1; valid account/instrument references; UTC-midnight numeric trade date (years 0001–9999); positive finite quantity/price; finite nonnegative fees; text description |
| stockPrices | `id`, `ticker`, `date`, `price` | Unique string ID; existing instrument; finite valid numeric timestamp; positive finite price |

Every imported backup must be self-contained: references cannot depend on records that only happen to exist in the target browser. IDs, relationships, descriptions (including whitespace), and supported numeric values are retained without normalization. Numbers remain JavaScript numbers; no new currency/rounding or financial policy is introduced. Nonfinite values and negative zero are rejected by the validated format; use recovery-only export to preserve unsupported values. Maximum file size is 10 MiB UTF-8 and maximum total record count is 100,000, including the merged result. Larger datasets require a separately designed streaming recovery path.

## Preview and restore

1. Choose a backup JSON file and explicitly choose a mode.
2. Choose **Preview restore**. Nothing is written. Inspect current, incoming and resulting counts.
3. **Merge** adds missing identities, skips exactly identical records, and blocks any same-ID/different-record conflict. It never overwrites. Different IDs remain separate records even if they look similar. **Replace** replaces all four collections with the backup, removing absent current records and using incoming values for matching IDs.
4. Choose **Download recovery backup**. Verify that file is saved, then check its confirmation box. Replacement also requires confirming its removal/overwrite consequences. Keep this recovery file until after inspection of the restored portfolio.
5. Choose **Apply restore** once. All four collections commit in one IndexedDB transaction. A failed/aborted transaction rolls back its clears and writes. The UI preserves the preview for retry after a storage failure. A successful operation disables further application until you explicitly choose another backup.
6. Inspect the restored records. To undo a completed restore, import its `my-portfolio-before-restore-…json` file, explicitly choose **Replace**, and repeat the preview/recovery/confirmation steps. This also makes a recovery copy of the now-current state.

**Cancel restore** before application discards only the preview. During a write, controls are disabled; interruption relies on IndexedDB transaction atomicity. If a tab/process closes around commit, inspect the portfolio on reopening: either the old or complete new state may be present. Retain the independent recovery file. Physical disk/device failure and browser-storage eviction are not prevented by a local transaction.

The database is compared with the preview's exact canonical records again inside the write transaction. Changes made by another tab after preview block restoration and require a new preview, recovery download and confirmation. There is no await of file dialogs or external work inside the write transaction. The recovery file is generated from the same consistent snapshot used by the preview; a mismatched copy is rejected at the service boundary.

The existing schema has record identities but no persistent dataset namespace. This feature does not invent or overwrite a sync identity. Merge collision checks protect existing IDs, but cannot infer whether different IDs describe the same real-world account/trade. Future dataset identity, tombstones, revision history and restore/sync reconciliation belong to #9/#19; connect no sync engine based solely on this format.

## Historical or malformed data: recovery-only archive

If validated export fails, open **Preserve historical or invalid records** and choose **Export recovery-only archive**. This separate, read-only path reads the actual native IndexedDB layout, including the historical three-store numeric-ID layout, without creating/upgrading it. It preserves known portfolio fields, primary keys, existing stores, key paths, auto-increment settings and index definitions. Known transaction `timestamp` and `order` fields are retained.

These files have `format: "my-portfolio-recovery-only"`, `archiveVersion: 1`, and `directlyImportable: false`. Each store has `keyPath`, `autoIncrement`, `indexes`, and `entries`. Each entry contains a tagged `key` and a `fields` array of `[fieldName, taggedValue]` pairs. Tags distinguish `null`, `undefined`, `string`, `boolean`, `number`, `bigint`, and `date`. Numeric values are strings in these tags, preserving `NaN`, `Infinity`, `-Infinity`, and `-0`; date values are epoch-millisecond strings, including `NaN` for an invalid date. Missing properties remain absent. No records are normalized or repaired.

**Recovery-only archives cannot be imported on this page.** They preserve evidence for a separately reviewed recovery/migration, not a promise of automated restoration. They never substitute for the valid pre-import recovery copy. Retain the original browser storage until reviewed recovery is available.

To avoid accidental credential export or lossy serialization, this limited archive rejects unknown stores/fields, nested/binary values, and non-object records. It also uses the size/count limits above. It is lossless for the documented supported scalar field types, not a universal IndexedDB clone. If rejected, do not clear the browser data; preserve the profile for a separately authorized specialist recovery. Credentials, encryption keys, authorization state, and arbitrary future extensions are not included.

## Development verification

Use only the synthetic fixtures and fresh nonpersistent browser contexts. Run `yarn test`, `yarn typecheck`, `yarn lint`, `yarn build`, and then `yarn test:e2e`. The browser suite includes the transaction-entry regressions plus download, fresh-context restore, cancellation, conflicts, multi-tab snapshot invalidation, partial-write failure/retry, recovery download failure and non-importable recovery archives. Platform results and limits are recorded in [issue-16 verification](verification/issue-16.md).
