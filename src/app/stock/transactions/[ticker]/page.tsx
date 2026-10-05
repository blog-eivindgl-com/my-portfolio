"use client"
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Container } from '@nextui-org/react';
import { useLiveQuery } from 'dexie-react-hooks';
import database, { accountsTable, stockTable, transactionsTable, stockPricesTable } from '../../../database/database.config';
import { resolveInstrument } from '@/app/services/instrumentLookup';
import { calculatePortfolio, parseValuationTime, PortfolioInput } from '@/app/services/portfolioCalculations';
import { portfolioViewModels } from '@/app/services/portfolioViewModels';
import MyNavbar from '@/app/components/NavbarComponent';
import Summary from './Summary';
import TransactionsList from './TransactionsList';
import styles from './views.module.css';

const nowInput = () => new Date().toISOString().slice(0, 19);
export default function Transactions({ params }: { params: { ticker: string } }) {
    const [view, setView] = useState<'combined' | 'accounts'>('combined');
    const tabs = useRef<Array<HTMLButtonElement | null>>([]);
    const [valuation, setValuation] = useState('');
    const [staleDays, setStaleDays] = useState('7');
    useEffect(() => { setValuation(nowInput()); setView('combined'); }, [params.ticker]);
    const source = useLiveQuery(async () => {
        try {
            return await database.transaction('r', accountsTable, stockTable, transactionsTable, stockPricesTable, async () => {
                const stock = await resolveInstrument(params.ticker);
                const data: PortfolioInput = {
                    accounts: await accountsTable.toArray(), instruments: [stock],
                    transactions: await transactionsTable.where('instrumentId').equals(stock.id).toArray(),
                    stockPrices: await stockPricesTable.where('instrumentId').equals(stock.id).toArray(),
                };
                return { stock, data, error: '' };
            });
        } catch { return { stock: undefined, data: undefined, error: 'Instrument unavailable or ticker ambiguous. Open an instrument from the list.' }; }
    }, [params.ticker]);
    const asOf = parseValuationTime(valuation), days = /^\d+$/.test(staleDays) ? Number(staleDays) : NaN;
    const valid = Number.isFinite(asOf) && Number.isInteger(days) && days >= 0 && days <= 3650;
    const report = source?.data && valid ? calculatePortfolio(source.data, { asOf, staleAfterDays: days }) : undefined;
    const combined = report && source?.data ? portfolioViewModels(report.positions, source.data.transactions, report.issues) : undefined;
    return <Container>
        <MyNavbar />
        <h1>{source?.stock?.ticker || 'Instrument'} - {source?.stock?.name}</h1>
        {!source && <p role="status">Loading instrument.</p>}
        {source?.error && <p role="alert">{source.error}</p>}
        {source?.stock && <>
            <Link href={`/stock/transactions/${source.stock.id}/create`}>Create transaction</Link>
            <p>Currency: {source.stock.currency || 'Unknown'}. No currency conversion is applied.</p>
            <p>Costs and fees are calculated separately for each account. Every sale deducts all accumulated fees, including its own fee, then resets that account&apos;s fee balance to zero. Buy fees stay outside remaining trade cost.</p>
            <p>The bottom line in Acc. brokerage marks each sale&apos;s fee reset. Unrealized gain describes the current position and is shown on its latest included row.</p>
            <details><summary>Valuation and calculation limits</summary>
                <p>Quotes use a UTC cutoff. Trades include the entire cutoff calendar date. Trade times are unzoned labels used only for same-day order. Missing, equal or contradictory order evidence prevents calculation. Pending fees are shown separately until the next sale. This is not tax reporting.</p>
                <div className={styles.controls}>
                    <label>Valuation time (UTC)<input type="datetime-local" step="1" value={valuation} onChange={event => setValuation(event.target.value)} /></label>
                    <button type="button" onClick={() => setValuation(nowInput())}>Use current UTC time</button>
                    <label>Stale after (days)<input type="number" min="0" max="3650" step="1" value={staleDays} onChange={event => setStaleDays(event.target.value)} /></label>
                </div>
            </details>
            {!valid && <p role="alert">Enter a valid UTC timestamp and 0-3650 whole days.</p>}
        </>}
        {report && combined && source?.data && <>
            <p>{report.futureTransactions} future transactions excluded at this cutoff; their records remain visible.</p>
            {report.issues.map((issue, index) => <p role="alert" key={index}>{issue.message}</p>)}
            <section aria-label="Instrument totals"><Summary vm={combined.summary} /></section>
            <div role="tablist" aria-label="Transaction view" className={styles.tabs}>
                {(['combined', 'accounts'] as const).map((tab, index) => <button key={tab} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`tab-${tab}`} aria-controls={`panel-${tab}`} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1}
                    onClick={() => setView(tab)} onKeyDown={event => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
                        setView(next === 0 ? 'combined' : 'accounts'); tabs.current[next]?.focus();
                    }}>{tab === 'combined' ? 'Combined' : 'Per account'}</button>)}
            </div>
            <div role="tabpanel" id="panel-combined" aria-labelledby="tab-combined" hidden={view !== 'combined'} tabIndex={0}>
                {view === 'combined' && <TransactionsList vm={combined.list} />}
            </div>
            <div role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts" hidden={view !== 'accounts'} tabIndex={0}>
                {view === 'accounts' && (report.positions.length ? report.positions.map(position => {
                    const account = source.data.accounts.find(row => row.id === position.accountId);
                    const models = portfolioViewModels([position], source.data.transactions.filter(row => row.accountId === position.accountId));
                    return <section key={position.accountId} aria-label={`Account ${position.accountId}`} className={styles.account}>
                        <h2>{account?.name || 'Unavailable account'} — {position.accountId}</h2>
                        <Summary vm={models.summary} /><TransactionsList vm={models.list} />
                    </section>;
                }) : <p>No transactions for this instrument.</p>)}
            </div>
        </>}
    </Container>;
}
