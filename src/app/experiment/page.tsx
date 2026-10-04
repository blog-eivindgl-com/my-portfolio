"use client"

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import database, { accountsTable, stockTable, stockPricesTable, transactionsTable } from '../database/database.config';
import { calculateExperimentalPortfolio, parseTrialTime, PortfolioInput, trialMoney } from '../services/experimentalPortfolio';
import { formatTradeDate } from '../services/transactionValidation';
import styles from './page.module.css';

const nowInput = () => new Date().toISOString().slice(0, 19);

export default function ExperimentPage() {
    const [valuation, setValuation] = useState('');
    const [staleDays, setStaleDays] = useState('7');
    useEffect(() => setValuation(nowInput()), []);
    const source = useLiveQuery(async () => {
        try {
            const data = await database.transaction('r', accountsTable, stockTable, transactionsTable, stockPricesTable, async (): Promise<PortfolioInput> => ({
                accounts: await accountsTable.toArray(), instruments: await stockTable.toArray(),
                transactions: await transactionsTable.toArray(), stockPrices: await stockPricesTable.toArray(),
            }));
            return { data, error: '' };
        } catch { return { data: undefined, error: 'Could not read browser records. Reload this page to retry; no records were changed.' }; }
    }, []);
    const asOf = parseTrialTime(valuation);
    const days = /^\d+$/.test(staleDays) ? Number(staleDays) : NaN;
    const valid = Number.isFinite(asOf) && Number.isInteger(days) && days >= 0 && days <= 3650;
    const report = source?.data && valid ? calculateExperimentalPortfolio(source.data, { asOf, staleAfterDays: days }) : undefined;
    const accountName = (id: string) => source?.data?.accounts.find(row => row.id === id)?.name || id;

    const instrumentName = (id: string) => {
        const instrument = source?.data?.instruments.find(row => row.id === id);
        return instrument ? instrument.name + (instrument.ticker ? ' (' + instrument.ticker + ')' : '') : id;
    };
    const currency = (id: string) => source?.data?.instruments.find(row => row.id === id)?.currency || 'Unknown';

    return <main className={styles.root}>
        <a href="/">Back to portfolio</a>
        <h1>Calculation experiment</h1>
        <p className={styles.notice}><strong>Trial policy — awaiting your decision.</strong> Weighted-average cost with purchase fees included. This read-only view preserves stored records and backups.</p>
        <p>Amounts use the instrument&apos;s recorded currency, where supplied; otherwise the currency is unknown. Consistent units within an instrument are assumed. There is no FX conversion or cross-instrument money total. This experiment is not tax reporting.</p>
        <p>The UTC cutoff selects quotes by timestamp and trades through its calendar date, including the whole cutoff day. Trade times are unzoned clock labels used only for same-day order; they are never interpreted as UTC execution instants. Known retained order is preserved. Missing, equal or contradictory order evidence blocks calculation.</p>
        <div className={styles.controls}>
            <label>Valuation time (UTC)<input type="datetime-local" step="1" value={valuation} onChange={event => setValuation(event.target.value)} /></label>
            <button onClick={() => setValuation(nowInput())}>Use current UTC time</button>
            <label>Stale after (days)<input type="number" min="0" max="3650" step="1" value={staleDays} onChange={event => setStaleDays(event.target.value)} /></label>
        </div>
        {!valid && source?.data && <p role="alert">Enter a valid UTC timestamp and 0–3650 whole days.</p>}
        {!source && <p role="status">Loading experiment records…</p>}
        {source?.error && <p role="alert">{source.error}</p>}
        {report && <>
            <p>{report.futureTransactions} future transactions excluded at this cutoff; their records remain visible below.</p>
            {report.issues.map((issue, index) => <p role="alert" key={index}>{issue.message}</p>)}
            <h2>Instrument totals</h2>
            {!report.positions.length && <p>No identifiable transactions to calculate.</p>}
            <div className={styles.scroll}><table aria-label="Trial instrument totals">
                <thead><tr><th>Instrument</th><th>Status</th><th>Units</th><th>Remaining cost</th><th>Realized gain</th><th>Market value</th><th>Unrealized gain</th></tr></thead>
                <tbody>{report.instruments.map(total => <tr key={total.instrumentId}>
                    <th scope="row">{instrumentName(total.instrumentId)}<br />{total.instrumentId}<br />Currency: {currency(total.instrumentId)}</th><td>{total.status}</td><td>{total.quantity ?? 'Unknown'}</td>
                    <td>{trialMoney(total.remainingCost)}</td><td>{trialMoney(total.realizedGain)}</td><td>{trialMoney(total.marketValue)}</td><td>{trialMoney(total.unrealizedGain)}</td>
                </tr>)}</tbody>
            </table></div>
            {report.positions.map(position => <section key={JSON.stringify([position.accountId, position.instrumentId])} aria-label={`${position.accountId} / ${position.instrumentId}`} className={styles.position}>
                <h2>{accountName(position.accountId)} / {instrumentName(position.instrumentId)}</h2>
                <p>Instrument ID: {position.instrumentId} · Currency: {currency(position.instrumentId)}</p>
                <p>Account ID: {position.accountId} · Position: {position.status === 'closed' ? 'closed / no units at cutoff' : position.status}</p>
                <a href={`/stock/transactions/${encodeURIComponent(position.instrumentId)}`}>Open standard transaction view (existing fee calculation)</a>
                {position.issues.map((issue, index) => <p role="alert" key={index}>{issue.transactionId && `${issue.transactionId}: `}{issue.message}</p>)}
                <dl className={styles.metrics}>
                    {[
                        ['Units', position.quantity ?? 'Unknown'], ['Remaining cost', trialMoney(position.remainingCost)],
                        ['Realized gain', trialMoney(position.realizedGain)], ['Market value', trialMoney(position.marketValue)],
                        ['Unrealized gain', trialMoney(position.unrealizedGain)], ['Purchase fees paid', trialMoney(position.buyFees)],
                        ['Purchase fees allocated to sales', trialMoney(position.allocatedBuyFees)], ['Purchase fees remaining in cost', trialMoney(position.remainingBuyFees)],
                        ['Sale fees paid', trialMoney(position.sellFees)], ['Net cash flow', trialMoney(position.netCashFlow)],
                    ].map(([label, value]) => <div key={label} role="group" aria-label={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
                <p>Valuation: {position.status === 'closed' ? 'quote not required for zero units' : position.quote.status}.
                    {position.quote.status === 'stale' && position.status === 'open' && ' Displayed market values are stale estimates.'}
                    {position.quote.price !== null && ` Recorded quote ${position.quote.price}.`}
                    {position.quote.date !== null && ` Observed ${new Date(position.quote.date).toISOString()}; age ${(position.quote.ageMilliseconds! / 86_400_000).toFixed(2)} days.`}
                    {!!position.quote.ids.length && ` Source IDs: ${position.quote.ids.join(', ')}.`}
                    {` Ignored: ${position.quote.ignoredInvalid} invalid and ${position.quote.ignoredFuture} future quotes.`}
                </p>
                <details>
                    <summary>Trial ledger and excluded records</summary>
                    <div className={styles.scroll}><table aria-label={`Trial ledger ${position.accountId} ${position.instrumentId}`}>
                        <thead><tr><th>Date</th><th>Trade time</th><th>Retained trade order</th><th>Record ID</th><th>Type</th><th>Status</th><th>Units</th><th>Price</th><th>Fee</th><th>Units after</th><th>Cost after</th><th>Released cost</th><th>Buy fee allocated</th><th>Net proceeds</th><th>Realized gain</th></tr></thead>
                        <tbody>{position.ledger.map((row, index) => <tr key={`${row.id}-${index}`}>
                            <td>{row.date !== null ? formatTradeDate(row.date) : 'Invalid date'}</td><td>{row.tradeTime ?? 'Unknown'}</td><td>{row.tradeOrder ?? 'Unknown'}</td><td>{row.id}</td><td>{row.type === 0 ? 'Buy' : row.type === 1 ? 'Sell' : 'Unsupported'}</td><td>{row.status}</td>
                            <td>{row.quantity ?? 'Invalid'}</td><td>{row.price ?? 'Invalid'}</td><td>{row.fee ?? 'Invalid'}</td><td>{row.quantityAfter ?? 'Unknown'}</td>
                            <td>{trialMoney(row.costAfter)}</td><td>{trialMoney(row.releasedCost)}</td><td>{trialMoney(row.allocatedBuyFee)}</td><td>{trialMoney(row.netProceeds)}</td><td>{trialMoney(row.realizedGain)}</td>
                        </tr>)}</tbody>
                    </table></div>
                </details>
            </section>)}
        </>}
        <section aria-label="Worked fee example" className={styles.position}>
            <h2>Why the trial shows 74 realized and 606 remaining cost</h2>
            <p>Buy 10 × 100 plus a 10 purchase fee. Sell 4 × 120 minus a 2 sale fee. Mark the remaining 6 units at 100.</p>
            <table><thead><tr><th>Step</th><th>Trial amount</th></tr></thead><tbody>
                <tr><th>Purchase cost: 1000 + 10</th><td>1010</td></tr>
                <tr><th>Cost per unit: 1010 / 10</th><td>101</td></tr>
                <tr><th>Net sale proceeds: 480 − 2</th><td>478</td></tr>
                <tr><th>Released cost: 4 × 101</th><td>404</td></tr>
                <tr><th>Realized gain: 478 − 404</th><td>74</td></tr>
                <tr><th>Remaining cost: 1010 − 404</th><td>606</td></tr>
                <tr><th>Unrealized gain: 600 − 606</th><td>−6</td></tr>
                <tr><th>Combined gain: 74 − 6</th><td>68</td></tr>
            </tbody></table>
            <p>The purchase fee is split: 4 goes with the sold units and 6 stays in remaining cost. The sale fee of 2 is deducted immediately. Cash reconciliation: −1010 + 478 + 600 = 68.</p>
            <p>The existing calculation instead reports realized 68, remaining investment 600, and unrealized 0 at this mark because it charges all purchase fees to the first sale. The combined result after this partial sale is 68 under both approaches. A full sale of 10 × 120 with fee 2 produces 188 under both. Your policy decision remains open.</p>
        </section>
        <details><summary>Trial assumptions and precision</summary>
            <p>Only buys and sells are supported. Oversells, missing references, invalid records and ambiguous same-day order block the affected result. There is no shorting, corporate-action, transfer, dividend or tax treatment. The trial uses recorded quotes only.</p>
            <p>Decimal calculations use 40 significant digits with half-up rounding. Money display uses two decimal places; totals use unformatted results. Stored JavaScript numbers remain unchanged, and previously lost precision cannot be recovered. Seven days is only the adjustable trial default for price staleness.</p>
        </details>
    </main>;
}
