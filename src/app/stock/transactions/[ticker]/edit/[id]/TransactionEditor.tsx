'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { TransactionSnapshot } from '@/app/database/types/foundation';
import PortfolioRepository, { TransactionConflictError } from '@/app/services/PortfolioRepository';
import { decimalDraft, TransactionDraft, TransactionErrors, transactionFromDraft, TransactionValidationError } from '@/app/services/transactionValidation';
import styles from '../../create/TransactionForm.module.css';

const repository = new PortfolioRepository();
export default function TransactionEditor({ ticker, id }: { ticker: string; id: string }) {
    const [snapshot, setSnapshot] = useState<TransactionSnapshot>();
    const [draft, setDraft] = useState<TransactionDraft>();
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [errors, setErrors] = useState<TransactionErrors>({});
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'deleted' | 'error' | 'conflict'>('idle');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const inFlight = useRef(false), completed = useRef(false);
    const attempt = useRef<{ kind: 'update' | 'delete'; id: string }>();
    const feedback = useRef<HTMLDivElement>(null);
    const back = `/stock/transactions/${encodeURIComponent(ticker)}`;

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setLoadError(''); setSnapshot(undefined); setDraft(undefined);
        setStatus('idle'); setErrors({}); setConfirmDelete(false); attempt.current = undefined; completed.current = false;
        repository.getTransaction(id).then(value => {
            if (value.record.ticker !== ticker) throw new Error('Wrong instrument');
            if (cancelled) return;
            setSnapshot(value);
            const row = value.record;
            setDraft({ type: row.type, accountId: row.accountId, date: new Date(row.date).toISOString().slice(0, 10), tradeTime: row.tradeTime || '',
                description: row.description, shares: decimalDraft(row.shares), price: decimalDraft(row.price), brokerage: decimalDraft(row.brokerage) });
        }).catch(error => {
            if (!cancelled) setLoadError(error instanceof TransactionConflictError ? error.message : 'Could not load this transaction. Return to the list or retry loading.');
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id, ticker, loadAttempt]);

    const locked = loading || status === 'saving' || status === 'saved' || status === 'deleted' || status === 'conflict';
    function update<K extends keyof TransactionDraft>(field: K, value: TransactionDraft[K]) {
        if (locked || inFlight.current || completed.current) return;
        setDraft(current => current && ({ ...current, [field]: value }));
        setErrors({}); setStatus('idle'); attempt.current = undefined;
    }
    async function change(kind: 'update' | 'delete') {
        if (locked || inFlight.current || completed.current || !snapshot || !draft || (kind === 'delete' && !confirmDelete)) return;
        inFlight.current = true; setStatus('saving'); setErrors({});
        try {
            if (attempt.current?.kind !== kind) attempt.current = { kind, id: crypto.randomUUID() };
            const target = { commandId: attempt.current.id, datasetId: snapshot.datasetId, entityId: snapshot.entity.entityId,
                transactionId: id, expectedRevision: snapshot.entity.revision };
            if (kind === 'update') await repository.updateTransaction(target, { ...transactionFromDraft(draft, id, ticker), description: draft.description });
            else await repository.deleteTransaction(target);
            completed.current = true; setStatus(kind === 'update' ? 'saved' : 'deleted'); setConfirmDelete(false);
        } catch (error) {
            setErrors(error instanceof TransactionValidationError ? error.errors : { form: error instanceof TransactionConflictError ? error.message
                : 'Could not save this change. Your entries are unchanged. Check browser storage and retry.' });
            setStatus(error instanceof TransactionConflictError ? 'conflict' : 'error');
        } finally { inFlight.current = false; feedback.current?.focus(); }
    }
    function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!confirmDelete) void change('update'); }

    return <main className={styles.root}>
        <h1>Edit transaction</h1>
        {loading && <p role="status">Loading transaction.</p>}
        {loadError && <><p role="alert">{loadError}</p><button onClick={() => setLoadAttempt(value => value + 1)}>Retry loading</button></>}
        {snapshot && draft && <form aria-label="Edit transaction" onSubmit={save} noValidate>
            <p>Instrument: <strong>{ticker}</strong>. Account: <strong>{snapshot.record.accountId}</strong>. These cannot be reassigned here.</p>
            <fieldset disabled={locked || confirmDelete} className={styles.fields}>
                <legend>Transaction details</legend>
                <label htmlFor="type">Transaction type</label>
                <select id="type" value={draft.type} onChange={event => update('type', Number(event.target.value))}><option value={0}>Buy</option><option value={1}>Sell</option></select>
                <label htmlFor="date">Trade date</label>
                <input id="date" type="date" value={draft.date} aria-invalid={!!errors.date} aria-describedby={errors.date ? 'error-date' : undefined} onChange={event => update('date', event.target.value)} />
                <label htmlFor="tradeTime">Trade time (optional)</label>
                <input id="tradeTime" type="time" step="60" value={draft.tradeTime || ''} aria-invalid={!!errors.tradeTime} aria-describedby="time-help" onChange={event => update('tradeTime', event.target.value)} />
                <p id="time-help">Use the trade-confirmation clock consistently for this account/instrument. No timezone conversion is applied. Blank means unknown; midnight is 00:00. Equal or missing same-day times still leave order unknown, including repeated daylight-saving times.</p>
                <label htmlFor="description">Description (optional)</label>
                <input id="description" value={draft.description} onChange={event => update('description', event.target.value)} />
                <p id="decimal-help">Use . or , for decimals, without thousands separators.</p>
                {([['shares', 'Quantity'], ['price', 'Price per unit'], ['brokerage', 'Brokerage / fees']] as const).map(([field, label]) => <div key={field}>
                    <label htmlFor={field}>{label}</label><input id={field} inputMode="decimal" value={draft[field]} aria-invalid={!!errors[field]}
                        aria-describedby={`decimal-help${errors[field] ? ` error-${field}` : ''}`} onChange={event => update(field, event.target.value)} />
                </div>)}
                {Object.entries(errors).filter(([field]) => field !== 'form').map(([field, message]) => <p className={styles.error} id={`error-${field}`} key={field}>{message}</p>)}
            </fieldset>
            <div ref={feedback} tabIndex={-1} className={styles.feedback}>
                {(status === 'error' || status === 'conflict') && <p role="alert">{errors.form || 'Check the highlighted transaction fields.'}</p>}
                {status === 'saved' && <p role="status">Transaction updated.</p>}
                {status === 'deleted' && <p role="status">Transaction deleted. Its deletion marker prevents ordinary backup merge from restoring it.</p>}
                {status === 'saving' && <p role="status">Saving locally. Keep this tab open.</p>}
            </div>
            {status === 'conflict' && <button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Reload latest and discard my edits</button>}
            <div className={styles.actions}>
                <button type="submit" disabled={locked || confirmDelete}>Save changes</button>
                {!confirmDelete && <button type="button" disabled={locked} onClick={() => { setConfirmDelete(true); attempt.current = undefined; }}>Delete transaction</button>}
            </div>
            {confirmDelete && <section aria-label="Confirm transaction deletion">
                <p>Delete this transaction from the active portfolio? Local change history and a deletion marker will be retained. This changes the calculated position.</p>
                <button type="button" disabled={locked} onClick={() => void change('delete')}>Confirm deletion</button>
                <button type="button" disabled={locked} onClick={() => { setConfirmDelete(false); attempt.current = undefined; setErrors({}); setStatus('idle'); }}>Cancel deletion</button>
            </section>}
        </form>}
        <a href={back} aria-disabled={status === 'saving'} onClick={event => { if (inFlight.current) event.preventDefault(); }}>Back to transactions</a>
    </main>;
}
