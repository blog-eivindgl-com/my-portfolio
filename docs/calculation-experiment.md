# Calculation-policy experiment — not accepted policy

On 4 October 2026 the owner authorized trying the proposed rules on this feature branch, while explicitly reserving agreement with them. The implementation is an opt-in, read-only `/experiment` page. It does not replace the standard view's fee calculation, write transactions, change database/backup formats, or implement tax reporting. This document records the trial decision for roadmap #14 / issue #17; the final policy remains undecided.

## Proposed rules under trial

- Separate moving weighted-average cost for each stored account ID and native instrument UUID (`instrumentId`). Display names, duplicate or absent tickers, and optional metadata never determine identity.
- On a buy, add `quantity × price + purchase fee` to remaining cost. Add the purchase fee to a separate remaining-fee pool for reconciliation.
- On a partial sale, release `prior cost × sold quantity / prior units`. Allocate the same proportion of the remaining purchase-fee pool. Net proceeds are `sold quantity × sale price − sale fee`. Realized gain is net proceeds less released cost. A full sale releases the entire remaining cost/fee pool, leaving exactly zero units and cost.
- Unrealized gain belongs to the current open position: `eligible quote × remaining units − remaining cost`. Closed positions have zero current market value and unrealized gain, even without a quote. Historical ledger rows show cost/proceeds/realized gain rather than pretending that old purchase lots are still open.
- An oversell blocks that account/instrument result; it is not interpreted as a short sale. Stored records are retained. Use the shared main-branch chronology rules: distinct complete retained `tradeOrder` values or distinct complete `tradeTime` labels supply same-day order. Missing, equal or contradictory evidence blocks calculation, including same-type rows. IDs are only deterministic display tie breakers. Retained order and clock labels are shown in the ledger.
- Quotes use the selected UTC valuation timestamp. Trades include the entire calendar date of that cutoff, excluding later dates. Stored `tradeTime` is an unzoned clock label used for ordering only; it cannot establish a UTC execution instant or an intraday cutoff. This makes the original date-only selection explicit without inventing a timezone. Future trades remain visible as excluded. Validate current records/references; unsupported records block that position instead of yielding a partial valid-looking subtotal.
- Use actual recorded price observations only. There is no transaction-price fallback in the trial. Select the latest valid quote at/before valuation time. Differing prices at that same latest timestamp make valuation unknown; identical quotes retain all source IDs. Display source IDs, timestamp, age, rejected-invalid/future counts, and missing/conflicting/stale status.
- The adjustable stale threshold defaults to **7 days for this experiment only**. Stale values remain labeled estimates; they are not reported as complete/current totals. Missing/conflicting values remain unknown, never zero for an open holding.
- Aggregate account positions only within the same instrument, assuming a consistent currency/price unit for that instrument. Show the supplied currency metadata or Unknown; never invent currency or FX rates. Do not produce a cross-instrument monetary total or claim currency reconciliation. Invalid positions make their instrument subtotal incomplete.

## Decimal and presentation choices

The calculation layer is pure: it receives arrays, an explicit valuation time and stale threshold; it reads no clock/storage and mutates no input. `decimal.js` 10.4.3 is an exact runtime dependency (already present transitively before this branch). A private Decimal constructor uses 40 significant digits and half-up arithmetic rounding. Existing stored numbers enter through their decimal string representation; precision already lost in number storage cannot be reconstructed without a future migration.

Money is displayed to two decimal places, half-up. Calculations and aggregation use the unformatted decimal results; displayed row totals can differ by a last-digit rounding amount from sums of individually rounded display cells. Quantities remain decimal strings, and raw result strings remain available in the pure report. No unit-specific currency precision, tax rounding or jurisdictional convention is inferred. This is a reviewable numerical policy, not a claim of exact financial or tax accounting.

## The disputed example, step by step

Buy 10 units at 100 and pay a purchase fee of 10. Later sell 4 units at 120 and pay a sale fee of 2. Use a market quote of 100 for the remaining holding.

| Step | Trial amount |
| --- | ---: |
| Purchase cost: `10 × 100 + 10` | 1010 |
| Average cost per unit: `1010 / 10` | 101 |
| Net sale proceeds: `4 × 120 − 2` | 478 |
| Cost released: `4 × 101` | 404 |
| Realized gain: `478 − 404` | **74** |
| Remaining cost: `1010 − 404` | **606** |
| Remaining market value: `6 × 100` | 600 |
| Unrealized gain: `600 − 606` | **−6** |
| Combined realized + unrealized gain | **68** |

Thus **74 is the realized component, not the combined gain** at a quote of 100. The 10 purchase fee is split into 4 released with the sold units and 6 retained in remaining cost. The sale fee of 2 is fully deducted from sale proceeds. Cash reconciliation gives the same combined amount: `−1010 + 478 + 600 = 68`.

The existing calculation charges all 10 purchase fees to the first partial sale: realized gain **68**, remaining investment **600**, and unrealized gain **0** at a quote of 100. Both sum to 68 after this partial sale, but assign purchase fees differently between sold and remaining units. Before any sale, the old summary omits purchase fees from investment/unrealized gain; the trial shows cost 1010 and unrealized −10. A full sale of the original 10 units at 120 with fee 2 produces 188 realized gain and zero remaining cost under both methods. These differences are exposed for review; neither comparison implies policy acceptance.

## Boundaries

The standard transaction view retains the earlier fee semantics and is labeled separately from the trial. Creation and restore validation are unchanged: the experiment flags an unsupported ledger without rewriting or rejecting stored trades. Corporate actions, transfers, dividends, income, taxes, FX, short positions, cross-instrument totals and new trade-order entry policy are outside this experiment. Final adoption requires the owner's decision. The schema4 migration, format4 backups, revision-checked corrections, tombstones, rename history and retry protections come from main unchanged. Opening the application still uses main's normal migration path for an older database; the experiment itself reads only the current records. Changes in another tab are reflected through a consistent Dexie read transaction.
