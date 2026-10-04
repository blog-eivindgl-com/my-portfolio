"use client"

import { FormEvent, useEffect, useRef, useState } from 'react';
import { IAccount, TransactionType } from '@/app/database/types/types';
import DbService from '@/app/services/DbService';
import {
    localDateInput, TransactionDraft, TransactionErrors, TransactionField,
    transactionFromDraft, TransactionValidationError,
} from '@/app/services/transactionValidation';
import styles from './TransactionForm.module.css';

const dbService = new DbService();
const emptyDraft = (accountId = '', date = ''): TransactionDraft => ({
    type: TransactionType.buy, accountId, date, tradeTime: '', description: '', shares: '', price: '', brokerage: '0',
});

export default function TransactionForm({ ticker }: { ticker: string }) {
    const [draft, setDraft] = useState<TransactionDraft>(() => emptyDraft());
    const [accounts, setAccounts] = useState<IAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [errors, setErrors] = useState<TransactionErrors>({});
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const inFlight = useRef(false);
    const attemptId = useRef<string>();
    const feedback = useRef<HTMLDivElement>(null);

    // Initialize the user's local calendar day after hydration, not the server's day.
    useEffect(() => {
        setDraft(current => ({ ...current, date: current.date || localDateInput() }));
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError('');
        dbService.getAccounts().then(value => {
            if (!cancelled) setAccounts(value);
        }).catch(() => {
            if (!cancelled) setLoadError('Could not load accounts. Reload accounts to try again.');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [loadAttempt]);

    function update<K extends keyof TransactionDraft>(field: K, value: TransactionDraft[K]) {
        if (inFlight.current || status === 'saved') return;
        setDraft(current => ({ ...current, [field]: value }));
        setErrors(current => ({ ...current, [field]: undefined, form: undefined }));
        setStatus('idle');
        attemptId.current = undefined;
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (inFlight.current || status === 'saved' || loading || loadError || !accounts.length) return;
        inFlight.current = true;
        setErrors({});
        setStatus('saving');
        try {
            attemptId.current ??= crypto.randomUUID();
            const transaction = transactionFromDraft(draft, attemptId.current, ticker);
            await dbService.addTransaction(transaction);
            setStatus('saved');
        } catch (error) {
            setErrors(error instanceof TransactionValidationError ? error.errors : {
                form: 'Could not save the transaction. Your entries are unchanged. Check browser storage availability and retry.',
            });
            setStatus('error');
        } finally {
            inFlight.current = false;
            feedback.current?.focus();
        }
    }

    function startAnother() {
        attemptId.current = undefined;
        setDraft(emptyDraft(draft.accountId, localDateInput()));
        setErrors({});
        setStatus('idle');
    }

    const locked = status === 'saving' || status === 'saved';
    const fieldError = (field: TransactionField) => errors[field] &&
        <p className={styles.error} id={`error-${field}`}>{errors[field]}</p>;

    return <section className={styles.root}>
        <h1>Create transaction</h1>
        <p>Instrument: <strong>{ticker}</strong></p>
        <form onSubmit={save} noValidate aria-label="Create transaction">
            <fieldset disabled={locked} className={styles.fields}>
                <legend>Transaction details</legend>
                <div className={styles.type}>
                    <span>Transaction type</span>
                    <label><input type="radio" name="type" checked={draft.type === TransactionType.buy}
                        onChange={() => update('type', TransactionType.buy)} /> Buy</label>
                    <label><input type="radio" name="type" checked={draft.type === TransactionType.sell}
                        onChange={() => update('type', TransactionType.sell)} /> Sell</label>
                    {fieldError('type')}
                </div>
                <div>
                    <label htmlFor="accountId">Account</label>
                    <select id="accountId" name="accountId" value={draft.accountId} required
                        disabled={loading || !!loadError} aria-invalid={!!errors.accountId}
                        aria-describedby={errors.accountId ? 'error-accountId' : undefined}
                        onChange={event => update('accountId', event.target.value)}>
                        <option value="">Select an account</option>
                        {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                    {fieldError('accountId')}
                    <button type="button" onClick={() => setLoadAttempt(value => value + 1)} disabled={loading}>
                        Reload accounts
                    </button>
                    {loading && <p role="status">Loading accounts…</p>}
                    {loadError && <p role="alert">{loadError}</p>}
                    {!loading && !loadError && !accounts.length &&
                        <p>No accounts yet. <a href="/accounts/create">Create an account</a> before adding a transaction.</p>}
                </div>
                <div>
                    <label htmlFor="date">Trade date</label>
                    <input id="date" name="date" type="date" required value={draft.date}
                        aria-invalid={!!errors.date} aria-describedby={errors.date ? 'error-date' : undefined}
                        onChange={event => update('date', event.target.value)} />
                    {fieldError('date')}
                </div>
                <div>
                    <label htmlFor="tradeTime">Trade time (optional)</label>
                    <input id="tradeTime" name="tradeTime" type="time" step="60" value={draft.tradeTime || ''}
                        aria-invalid={!!errors.tradeTime} aria-describedby={`time-help${errors.tradeTime ? ' error-tradeTime' : ''}`}
                        onChange={event => update('tradeTime', event.target.value)} />
                    <p id="time-help">Use the clock time on your trade confirmation, consistently for this account/instrument. It stays on the selected trade date without timezone conversion. Leave blank if unknown. Equal or missing times do not establish an order, including repeated daylight-saving times.</p>
                    {fieldError('tradeTime')}
                </div>
                <div>
                    <label htmlFor="description">Description (optional)</label>
                    <input id="description" name="description" value={draft.description}
                        onChange={event => update('description', event.target.value)} />
                    {fieldError('description')}
                </div>
                <p id="decimal-help">Use . or , for decimals, without thousands separators. Fractional units are supported.</p>
                {([['shares', 'Quantity'], ['price', 'Price per unit'], ['brokerage', 'Brokerage / fees']] as const).map(([field, label]) =>
                    <div key={field}>
                        <label htmlFor={field}>{label}</label>
                        <input id={field} name={field} type="text" inputMode="decimal" required value={draft[field]}
                            aria-invalid={!!errors[field]}
                            aria-describedby={`decimal-help${errors[field] ? ` error-${field}` : ''}`}
                            onChange={event => update(field, event.target.value)} />
                        {fieldError(field)}
                    </div>)}
            </fieldset>
            <div ref={feedback} tabIndex={-1} className={styles.feedback}>
                {status === 'error' && <p role="alert" className={styles.error}>
                    {errors.form || errors.ticker || errors.id || 'Check the highlighted transaction fields.'}
                </p>}
                {status === 'saved' && <p role="status">Transaction saved.</p>}
            </div>
            <div className={styles.actions}>
                <button type="submit" disabled={locked || loading || !!loadError || !accounts.length}>
                    {status === 'saving' ? 'Saving…' : status === 'error' ? 'Retry save' : 'Save transaction'}
                </button>
                {status === 'saved' && <button type="button" onClick={startAnother}>Create another transaction</button>}
                <a href={`/stock/transactions/${encodeURIComponent(ticker)}`}>Back to transactions</a>
            </div>
        </form>
    </section>;
}
