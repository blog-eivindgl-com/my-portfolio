"use client"

import { ChangeEvent, useRef, useState } from 'react';
import BackupService, { RestorePreview } from '../services/BackupService';
import { BACKUP_MAX_BYTES, BackupError, RestoreMode, storeNames } from '../services/backupFormat';
import styles from './page.module.css';

const service = new BackupService();

function downloadBackup(content: string, prefix: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupPage() {
    const [content, setContent] = useState('');
    const [mode, setMode] = useState<RestoreMode | ''>('');
    const [preview, setPreview] = useState<RestorePreview>();
    const [recovery, setRecovery] = useState('');
    const [saved, setSaved] = useState(false);
    const [replaceConfirmed, setReplaceConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [completed, setCompleted] = useState(false);
    const inFlight = useRef(false);
    const fileInput = useRef<HTMLInputElement>(null);

    function clearPreview() {
        setPreview(undefined); setRecovery(''); setSaved(false); setReplaceConfirmed(false); setCompleted(false);
    }

    async function run(action: () => Promise<void>) {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError(''); setMessage('');
        try { await action(); }
        catch (error) {
            setError(error instanceof BackupError ? error.message : 'The operation failed. No partial restore was committed. Keep your backup, check browser storage or download availability, and retry.');
        } finally { inFlight.current = false; setBusy(false); }
    }

    async function selectFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (inFlight.current) return;
        clearPreview(); setContent(''); setMode('');
        if (!file) return;
        await run(async () => {
            if (file.size > BACKUP_MAX_BYTES) throw new BackupError('Backup exceeds the 10 MiB limit.');
            const text = await file.text();
            if (!text.trim()) throw new BackupError('The backup file is empty. Choose a complete JSON backup.');
            setContent(text);
            setMessage('File loaded. Choose a restore mode and preview before making changes.');
        });
    }

    function cancel() {
        if (inFlight.current) return;
        clearPreview(); setContent(''); setMode(''); setError('');
        setMessage(completed ? 'Choose a backup to preview another restore.' : 'Restore cancelled. No records were changed.');
        if (fileInput.current) fileInput.current.value = '';
    }

    return <main className={styles.root}>
        <a href="/">Back to portfolio</a>
        <h1>Backup and restore</h1>
        <p>Save a local JSON backup of accounts, instruments, transactions and prices. No cloud sign-in is needed.</p>
        <p>Backups contain private financial data and are not encrypted. Keep them in a safe location. Credentials and authorization state are not part of this format.</p>
        <button disabled={busy} onClick={() => run(async () => {
            downloadBackup(await service.exportBackup(), 'my-portfolio-backup');
            setMessage('Backup download requested. Check your Downloads folder and keep the file before clearing browser data.');
        })}>Export backup</button>

        <details>
            <summary>Preserve historical or invalid records</summary>
            <p>If validated export fails, a recovery-only archive can preserve the known portfolio fields, original keys and storage layout without repairing them. It is not directly importable. Keep the browser data until a reviewed recovery or migration is available. Unknown fields/stores and nested/binary values are rejected to avoid leaking credentials or losing values.</p>
            <button disabled={busy} onClick={() => run(async () => {
                downloadBackup(await service.exportRecoveryArchive(), 'my-portfolio-recovery-only-NOT-IMPORTABLE');
                setMessage('Recovery-only download requested. Verify the file is saved. This archive cannot be restored by this page; retain browser storage.');
            })}>Export recovery-only archive</button>
        </details>

        <h2>Restore from a backup</h2>
        <p>Exports use version 3 and preserve transaction deletion markers. Version-2 files remain readable; version-1 files are incompatible (up to 10 MiB / 100,000 records including deletion markers). A restore that changes records or markers starts a new dataset history, preserving stable entity IDs and replacing local change history with one complete baseline. Device identity and pending operations are never imported.</p>
        <fieldset disabled={busy || completed} className={styles.fields}>
            <legend>File and restore mode</legend>
            <label htmlFor="backup-file">Backup JSON file</label>
            <input ref={fileInput} id="backup-file" type="file" accept=".json,application/json" onChange={selectFile} />
            <label htmlFor="restore-mode">Restore mode</label>
            <select id="restore-mode" value={mode} onChange={event => {
                setMode(event.target.value as RestoreMode | ''); clearPreview(); setError(''); setMessage('');
            }}>
                <option value="">Choose a mode</option>
                <option value="merge">Merge: add missing records, keep existing records</option>
                <option value="replace">Replace: replace all four record collections</option>
            </select>
            <p>Merge skips identical records and blocks conflicting IDs. It does not deduplicate different IDs. Replace removes current records absent from the backup and uses the backup&apos;s values for matching IDs.</p>
            <p>Merge blocks live/deleted conflicts. Replacement is new-dataset recovery: it replaces deletion markers too and can restore previously deleted transactions from an older backup. Keep the recovery copy.</p>
            <button disabled={!content || !mode} onClick={() => run(async () => {
                clearPreview();
                const next = await service.preview(content, mode as RestoreMode);
                setPreview(next);
                setMessage('Preview ready. Nothing has been written.');
            })}>Preview restore</button>
        </fieldset>

        {preview && !completed && <section aria-label="Restore preview">
            <h2>{preview.mode === 'merge' ? 'Merge' : 'Replacement'} preview</h2>
            <table>
                <caption>Record counts before and after restore</caption>
                <thead><tr><th>Collection</th><th>Current</th><th>Backup</th><th>Result</th></tr></thead>
                <tbody>{storeNames.map(store => <tr key={store}><th scope="row">{store}</th><td>{preview.current[store]}</td><td>{preview.incoming[store]}</td><td>{preview.result[store]}</td></tr>)}</tbody>
            </table>
            <p>Transaction deletion markers: current {preview.tombstones.current}, backup {preview.tombstones.incoming}, result {preview.tombstones.result}.</p>
            {preview.mode === 'merge' && <p>{preview.identical} identical records will be skipped.</p>}
            {!!preview.conflicts.length && <div role="alert">
                <p>{preview.conflicts.length} conflicting record identities block merge. Nothing will be overwritten. Choose another backup or explicitly preview replacement.</p>
                <ul>{preview.conflicts.slice(0, 10).map((conflict, index) => <li key={index}>{conflict}</li>)}</ul>
            </div>}
            <fieldset disabled={busy || !!preview.conflicts.length} className={styles.fields}>
                <legend>Recovery copy and confirmation</legend>
                <p>Before any restore, download the current portfolio and confirm the file is saved. The app cannot verify a browser download completed. Close other portfolio tabs; changes after this preview require a new preview and recovery copy.</p>
                <button onClick={() => run(async () => {
                    downloadBackup(preview.recoveryText, 'my-portfolio-before-restore');
                    setRecovery(preview.recoveryText); setSaved(false);
                    setMessage('Recovery download requested. Verify the file is saved before confirming below.');
                })}>Download recovery backup</button>
                <label><input type="checkbox" disabled={!recovery} checked={saved} onChange={event => setSaved(event.target.checked)} /> I verified that the recovery backup file is saved.</label>
                {preview.mode === 'replace' && <label><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)} /> I understand replacement removes current records not in this backup and replaces matching records. It starts a new dataset, replaces deletion markers and may restore previously deleted transactions.</label>}
                <button disabled={!saved || !recovery || (preview.mode === 'replace' && !replaceConfirmed)} onClick={() => {
                    if (completed || !saved || !recovery || (preview.mode === 'replace' && !replaceConfirmed)) return;
                    void run(async () => {
                        await service.restore(preview, recovery);
                        setCompleted(true); setPreview(undefined); setRecovery(''); setSaved(false);
                        setMessage('Restore complete. All records were committed together. Keep the recovery backup until you have checked the portfolio.');
                    });
                }}>{busy ? 'Working…' : 'Apply restore'}</button>
            </fieldset>
        </section>}
        {!completed && <button disabled={busy} onClick={cancel}>Cancel restore</button>}
        {completed && <button disabled={busy} onClick={cancel}>Choose another backup</button>}
        <div aria-live="polite">{busy ? <p role="status">Working locally. Keep this tab open.</p> : message && <p role="status">{message}</p>}</div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
    </main>;
}
