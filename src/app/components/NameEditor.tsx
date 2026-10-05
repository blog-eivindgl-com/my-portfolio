'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { NamedEntitySnapshot, NameStore } from '../database/types/foundation';
import { InstrumentLookupError } from '../services/InstrumentLookupError';
import PortfolioRepository, { NameConflictError, NameValidationError } from '../services/PortfolioRepository';
import styles from '../stock/transactions/[ticker]/create/TransactionForm.module.css';

const repository = new PortfolioRepository();
export default function NameEditor({ store, recordKey }: { store: NameStore; recordKey: string }) {
    const label = store === 'accounts' ? 'account' : 'instrument', back = store === 'accounts' ? '/accounts' : '/stock';
    const [snapshot, setSnapshot] = useState<NamedEntitySnapshot>();
    const [name, setName] = useState(''), [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0), [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
    const [invalidName, setInvalidName] = useState(false);
    const commandId = useRef<string>(), inFlight = useRef(false), completed = useRef(false);
    const feedback = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let cancelled = false;
        setLoading(true); setSnapshot(undefined); setError(''); setStatus('idle'); setInvalidName(false);
        commandId.current = undefined; completed.current = false;
        repository.getNamedEntity(store, recordKey).then(value => {
            if (!cancelled) { setSnapshot(value); setName(value.record.name); }
        }).catch(error => {
            if (!cancelled) setError(error instanceof NameConflictError || error instanceof InstrumentLookupError ? error.message : 'Could not load this record. Keep browser storage and retry loading.');
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [store, recordKey, attempt]);
    const locked = loading || status === 'saving' || status === 'saved' || status === 'conflict';
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (locked || inFlight.current || completed.current || !snapshot) return;
        inFlight.current = true; setStatus('saving'); setError(''); setInvalidName(false);
        try {
            commandId.current ??= crypto.randomUUID();
            const target = { commandId: commandId.current, datasetId: snapshot.datasetId, entityId: snapshot.entity.entityId, recordKey: snapshot.entity.recordKey, expectedRevision: snapshot.entity.revision };
            if (store === 'accounts') await repository.renameAccount(target, name);
            else await repository.renameInstrument(target, name);
            completed.current = true; setStatus('saved');
        } catch (error) {
            setInvalidName(error instanceof NameValidationError);
            setError(error instanceof NameConflictError || error instanceof NameValidationError ? error.message : 'Could not save the name. Your entry is unchanged. Check browser storage and retry.');
            setStatus(error instanceof NameConflictError ? 'conflict' : 'error');
        } finally { inFlight.current = false; feedback.current?.focus(); }
    }
    return <main className={styles.root}>
        <h1>Edit {label} name</h1>
        <p>{store === 'accounts' ? 'Account ID' : 'Instrument reference'}: <strong>{recordKey}</strong>. Renaming keeps this identity and its transaction references unchanged.</p>
        {loading && <p role="status">Loading {label}.</p>}
        {!loading && !snapshot && <><p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry loading</button></>}
        {snapshot && <form aria-label={`Edit ${label} name`} onSubmit={save} noValidate>
            <fieldset className={styles.fields} disabled={locked}>
                <legend>Name</legend>
                <label htmlFor="name">{store === 'accounts' ? 'Account name' : 'Instrument name'}</label>
                <input id="name" value={name} required aria-invalid={invalidName} aria-describedby={invalidName ? 'name-error' : undefined} onChange={event => {
                    if (inFlight.current || completed.current || locked) return;
                    setName(event.target.value); setError(''); setInvalidName(false); setStatus('idle'); commandId.current = undefined;
                }} />
            </fieldset>
            <div ref={feedback} tabIndex={-1} className={styles.feedback}>
                {error && <p id="name-error" role="alert">{error}</p>}
                {status === 'saving' && <p role="status">Saving locally. Keep this tab open.</p>}
                {status === 'saved' && <p role="status">Name updated.</p>}
            </div>
            <button disabled={locked} type="submit">Save name</button>
            {status === 'conflict' && <button type="button" onClick={() => setAttempt(value => value + 1)}>Reload latest and discard my edits</button>}
        </form>}
        <p><a href={back} aria-disabled={status === 'saving'} onClick={event => { if (inFlight.current) event.preventDefault(); }}>Back to {store === 'accounts' ? 'accounts' : 'instruments'}</a></p>
    </main>;
}
