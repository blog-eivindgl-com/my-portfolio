import Dexie from 'dexie';
import database from '../database/database.config';
import { exportRecoveryArchive } from './recoveryArchive';
import {
    BackupError, canonicalRecords, combineRecords, counts, createBackup, parseBackup,
    PortfolioRecords, RecordCounts, RestoreMode, serializeBackup, storeNames,
} from './backupFormat';

export interface RestorePreview {
    mode: RestoreMode;
    incomingText: string;
    recoveryText: string;
    current: RecordCounts;
    incoming: RecordCounts;
    result: RecordCounts;
    conflicts: string[];
    identical: number;
}

export default class BackupService {
    constructor(private readonly db: Dexie = database) {}

    exportRecoveryArchive(): Promise<string> { return exportRecoveryArchive(this.db.name); }

    private async ready() {
        await this.db.open();
        if (this.db.verno !== 1 || this.db.tables.length !== storeNames.length) throw new BackupError('Unsupported local database layout. Restore requires the current version-1 layout.');
        for (const store of storeNames) {
            const key = this.db.table(store).schema.primKey;
            if (key.auto || key.keyPath !== (store === 'stocks' ? 'ticker' : 'id')) throw new BackupError('Unsupported historical identity layout. Export/restore does not migrate records.');
        }
    }

    private async readRecords(): Promise<PortfolioRecords> {
        const [accounts, stocks, transactions, stockPrices] = await Promise.all(storeNames.map(store => this.db.table(store).toArray()));
        return { accounts, stocks, transactions, stockPrices };
    }

    async exportBackup(): Promise<string> {
        await this.ready();
        return this.db.transaction('r', [...storeNames], async () => serializeBackup(createBackup(await this.readRecords())));
    }

    async preview(content: string, mode: RestoreMode): Promise<RestorePreview> {
        const incoming = parseBackup(content);
        const recoveryText = await this.exportBackup();
        const current = parseBackup(recoveryText);
        const combined = combineRecords(current.records, incoming.records, mode);
        // Also ensure the resulting dataset is exportable before allowing a write.
        serializeBackup(createBackup(combined.records));
        return {
            mode, incomingText: serializeBackup(incoming), recoveryText,
            current: counts(current.records), incoming: counts(incoming.records), result: counts(combined.records),
            conflicts: combined.conflicts, identical: combined.identical,
        };
    }

    async restore(preview: RestorePreview, savedRecoveryText: string): Promise<void> {
        // Revalidate at the write boundary; callers cannot bypass preview validation.
        const incoming = parseBackup(preview.incomingText);
        const baseline = parseBackup(preview.recoveryText);
        const saved = parseBackup(savedRecoveryText);
        if (canonicalRecords(saved.records) !== canonicalRecords(baseline.records)) throw new BackupError('The recovery copy does not match this preview. Download a new recovery backup.');
        const combined = combineRecords(baseline.records, incoming.records, preview.mode);
        if (combined.conflicts.length) throw new BackupError('Merge has conflicting identities. Nothing was changed. Review the preview or explicitly choose replacement.');
        serializeBackup(createBackup(combined.records));
        await this.ready();
        await this.db.transaction('rw', [...storeNames], async () => {
            const current = createBackup(await this.readRecords());
            if (canonicalRecords(current.records) !== canonicalRecords(baseline.records)) throw new BackupError('Portfolio changed after preview. Preview again and save a new recovery backup before restoring.');
            if (preview.mode === 'replace') {
                for (const store of storeNames) await this.db.table(store).clear();
                for (const store of storeNames) await this.db.table(store).bulkAdd(incoming.records[store]);
            } else {
                for (const store of storeNames) {
                    const known = new Set(current.records[store].map(row => store === 'stocks' ? (row as { ticker: string }).ticker : (row as { id: string }).id));
                    const additions = [...incoming.records[store]].filter(row => !known.has(store === 'stocks' ? (row as { ticker: string }).ticker : (row as { id: string }).id));
                    await this.db.table(store).bulkAdd(additions);
                }
            }
        });
    }
}
