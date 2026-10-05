# Instrument calculations and account views

The owner confirmed the fee rule on 5 October 2026: accumulate fees separately for each account and instrument, deduct the entire balance plus the current sale fee on every sale (including partial sales), then reset the balance to zero. Subsequent buys accumulate from zero; a consecutive sale deducts only its own fee. See the [fee comment](https://github.com/blog-eivindgl-com/my-portfolio/pull/27#issuecomment-5999606216) and [view comment](https://github.com/blog-eivindgl-com/my-portfolio/pull/27#issuecomment-5999635264). This is the application's chosen calculation convention, not tax advice or a claim about jurisdictional accounting rules.

## Cost and fee calculation

For each `(accountId, instrumentId)` independently:

- A buy adds `quantity × trade price` to remaining cost and adds its fee to the pending fee balance. Purchase fees are not included in average unit cost.
- A sale releases weighted-average trade cost for its units. Realized gain is `quantity × sale price − released trade cost − pending buy fees − this sale's fee`. The pending fee balance becomes zero after every sale.
- The sale row's **Acc. brokerage** cell shows the entire fee deduction and retains its bottom border to mark the reset. Buy rows show the currently accumulating balance.
- Pending fees remain visible separately until a sale. Unrealized gain is current market value minus remaining trade cost. Consequently, before all pending fees have been charged, `realized + unrealized − pending fees = net cash flow + market value`.
- Full sales clear remaining cost exactly; later purchases begin a new holding without losing prior realized gain. Oversells are unsupported and block that account's result rather than borrowing units from another account.

Example: buy 10 at 100 with fee 10; sell 4 at 120 with fee 2. Realized gain is `480 − 400 − 10 − 2 = 68`, remaining trade cost is 600, and pending fees are zero. A subsequent sale of 3 at 120 with fee 1 realizes 59; it does not charge the first purchase fee again.

## Combined and Per account

The instrument page opens on **Combined**, with the existing single transaction grid. **Per account** shows separate grids and account summaries. Both views project the same decimal results. The instrument summary stays above the tabs and aggregates account results without pooling cost or fee balances. Arrow keys and Home/End navigate the tabs. Switching tabs changes only presentation, never storage, history or calculations. Reload defaults to Combined.

Each row's balances belong to its account. Remaining cost is the trade-cost balance after that row. Unrealized gain is a current-position figure shown on its latest included row, not a claim that an old purchase lot remains open. Missing or ambiguous calculation results are explicitly unknown; valid accounts remain readable even when another account prevents a complete total.

## Valuation and limitations

The valuation controls accept a UTC timestamp for quotes. Trades include the entire corresponding calendar date. Unzoned trade clock labels are used only for same-day order, never converted into UTC execution instants. Retained historical order and known distinct times are preserved; missing, equal or contradictory order evidence blocks calculation. Future-dated records stay visible but are excluded from balances.

Only actual recorded quotes are used in the main instrument view. Select the latest valid quote at or before the cutoff. Conflicting prices at that timestamp make valuation unknown; missing quotes never become zero or a transaction-price substitute. Quote provenance, age and staleness are shown. The adjustable warning threshold defaults to seven days; it is a display setting, not a promise that any quote is current. Closed holdings have zero market value and unrealized gain without requiring a quote.

Native instrument UUIDs supply identity. Duplicate or absent tickers and renamed records cannot combine instruments. Currency metadata is shown as supplied or Unknown; consistent units within one instrument are assumed. No FX or cross-instrument monetary total is inferred.

The pure engine uses a private Decimal constructor with 40 significant digits and half-up arithmetic. Aggregation happens before conversion at the existing numeric UI boundary. Input records are not mutated; lost precision in stored JavaScript numbers cannot be recovered. Storage schema4, backup4, revisions, tombstones, migration and retry guarantees are unchanged. The old experiment route and policy are removed. Corporate actions, transfers, dividends, shorts and tax treatment remain outside this calculation.
