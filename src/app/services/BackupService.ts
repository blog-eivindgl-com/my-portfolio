import Dexie from 'dexie';
import database from '../database/database.config';
import { allStores, baseline, readDomain } from '../database/foundation';
import { EntityState, LocalState } from '../database/types/foundation';
import { exportRecoveryArchive } from './recoveryArchive';
import {
    BackupError, canonicalRecords, canonicalSnapshot, combineRecords, counts, createBackup, parseBackup,
    PortfolioRecords, RecordCounts, RestoreMode, serializeBackup, storeNames, PortfolioBackup,
} from './backupFormat';

export interface RestorePreview {
    mode: RestoreMode; incomingText: string; recoveryText: string;
    current: RecordCounts; incoming: RecordCounts; result: RecordCounts;
    conflicts: string[]; identical: number;
    tombstones: { current: number; incoming: number; result: number };
}
function combine(current: PortfolioBackup, incoming: PortfolioBackup, mode: RestoreMode) {
    const result = combineRecords(current.records, incoming.records, mode);
    const entities: EntityState[] = mode === 'replace' ? incoming.identity.entities : [...current.identity.entities];
    const known = new Map(entities.map(entity => [entity.key, entity]));
    if (mode === 'merge') for (const row of incoming.identity.entities) {
        const existing = known.get(row.key);
        if (!existing) entities.push(row);
        else if (existing.entityId !== row.entityId) result.conflicts.push(`${row.key} has a different stable identity.`);
        else if (existing.deleted !== row.deleted) result.conflicts.push(`${row.key} conflicts with a deletion marker. Merge cannot delete or resurrect a transaction.`);
    }
    // Keep the current side of a deletion conflict in the preview; applying any conflict is blocked.
    if (mode === 'merge') {
        const deleted = new Set(current.identity.entities.filter(entity => entity.deleted).map(entity => entity.recordKey));
        result.records.transactions = result.records.transactions.filter(row => !deleted.has(row.id));
    }
    // Check for a stable UUID assigned to two different legacy keys as well.
    createBackup(result.records, { datasetId: current.identity.datasetId, entities });
    return { ...result, entities };
}
export default class BackupService {
    constructor(private readonly db: Dexie = database) {}
    exportRecoveryArchive(): Promise<string> { return exportRecoveryArchive(this.db.name); }
    private async ready() {
        await this.db.open();
        if (this.db.verno !== 4 || this.db.tables.length !== allStores.length) throw new BackupError('Unsupported historical/local database layout. Restore requires version 4; no reset was attempted.');
        for (const store of storeNames) {
            const key = this.db.table(store).schema.primKey;
            if (key.auto || key.keyPath !== 'id') throw new BackupError('Unsupported historical identity layout.');
        }
    }
    private async snapshot(): Promise<PortfolioBackup> {
        const state: LocalState = await this.db.table('localState').get('local');
        if (!state) throw new BackupError('Missing dataset metadata. Retain storage for reviewed recovery.');
        return createBackup(await readDomain(this.db), { datasetId: state.datasetId, entities: await this.db.table('entityStates').toArray() });
    }
    async exportBackup(): Promise<string> {
        await this.ready();
        return this.db.transaction('r', allStores, async () => serializeBackup(await this.snapshot()));
    }
    async preview(content: string, mode: RestoreMode): Promise<RestorePreview> {
        const incoming = parseBackup(content);
        const recoveryText = await this.exportBackup();
        const current = parseBackup(recoveryText);
        const combined = combine(current, incoming, mode);
        return { mode, incomingText: serializeBackup(incoming), recoveryText,
            current: counts(current.records), incoming: counts(incoming.records), result: counts(combined.records),
            conflicts: combined.conflicts, identical: combined.identical,
            tombstones: { current: current.identity.entities.filter(row => row.deleted).length, incoming: incoming.identity.entities.filter(row => row.deleted).length, result: combined.entities.filter(row => row.deleted).length } };
    }
    async restore(preview: RestorePreview, savedRecoveryText: string): Promise<void> {
        const incoming = parseBackup(preview.incomingText), before = parseBackup(preview.recoveryText), saved = parseBackup(savedRecoveryText);
        if (canonicalSnapshot(saved) !== canonicalSnapshot(before)) throw new BackupError('The recovery copy does not match this preview. Download a new recovery backup.');
        const combined = combine(before, incoming, preview.mode);
        if (combined.conflicts.length) throw new BackupError('Merge has conflicting identities. Nothing was changed. Review the preview or explicitly choose replacement.');
        await this.ready();
        await this.db.transaction('rw', allStores, async () => {
            // Compare raw records first so an out-of-band legacy writer also invalidates a preview.
            if (canonicalRecords(await readDomain(this.db)) !== canonicalRecords(before.records)
                || canonicalSnapshot(await this.snapshot()) !== canonicalSnapshot(before)) throw new BackupError('Portfolio changed after preview. Preview again and save a new recovery backup before restoring.');
            if (preview.mode === 'merge' && canonicalSnapshot(createBackup(combined.records, { datasetId: before.identity.datasetId, entities: combined.entities })) === canonicalSnapshot(before)) return;
            for (const store of storeNames) await this.db.table(store).clear();
            for (const store of storeNames) await this.db.table(store).bulkAdd(combined.records[store]);
            // One new, complete baseline is queued atomically, with a new dataset ID.
            // Stable entity IDs survive; revisions refer to the new local baseline.
            await baseline(this.db, combined.records, combined.entities);
        });
    }
}
