import { HistoricalMigrationError } from './HistoricalMigrationError';
import Dexie, { Table } from 'dexie';
import { historicalLayout, migrateHistorical, HistoricalSource, HistoricalLayout } from './historicalMigration';
import { appendOperation, sealLegacyOperations } from './operationIntegrity';
import { allStores, domainStores, domainKey, EntityState, LocalState, newEntity, newId, Operation } from './types/foundation';
import { PortfolioRecords } from '../services/backupFormat';
import { baseline as legacyBaseline, legacySchema, readDomain as readLegacyDomain } from '../legacy/database/foundation';
import { validateRecords as validateLegacyRecords } from '../legacy/services/backupFormat';
import { inspectIdentityIntegrity as inspectLegacyIntegrity } from '../legacy/database/identityIntegrity';
import { inspectIdentityIntegrity } from './identityIntegrity';
import { convertLegacySnapshot } from './instrumentMigration';
interface TableAccess { table(name: string): Table; }
export { allStores, legacySchema };
const metadataSchema = { localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' };
export const nativeSchema = { accounts: 'id,name', instruments: 'id,ticker,name', transactions: 'id,instrumentId,accountId,date', stockPrices: 'id,instrumentId,date', ...metadataSchema, operationDigests: 'id,&sequence' };
export async function readDomain(db: TableAccess): Promise<PortfolioRecords> {
    const [accounts, instruments, transactions, stockPrices] = await Promise.all(domainStores.map(store => db.table(store).toArray()));
    return { accounts, instruments, transactions, stockPrices };
}
export async function baseline(tx: TableAccess, records: PortfolioRecords, identities?: EntityState[], sourceMigration?: HistoricalSource): Promise<void> {
    const previous: LocalState | undefined = await tx.table('localState').get('local');
    const id = newId(), datasetId = newId(), deviceId = previous?.deviceId || newId(), sequence = previous?.nextSequence ?? 1;
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid or exhausted device sequence.');
    const knownIds = new Map(identities?.map(entity => [entity.key, entity.entityId]));
    const entities = domainStores.flatMap(store => records[store].map(row => {
        const key = domainKey(store, row); return newEntity(store, key, id, store === 'instruments' ? key : knownIds.get(JSON.stringify([store, key])));
    }));
    entities.push(...(identities || []).filter(e => e.deleted).map(e => ({ ...e, revision: id })));
    await tx.table('entityStates').clear(); await tx.table('outbox').clear(); await tx.table('operationDigests').clear(); await tx.table('entityStates').bulkAdd(entities);
    await appendOperation(tx, { id, operationVersion: 4, datasetId, deviceId, sequence, kind: 'baseline', entityId: null, baseRevision: null, createdAt: new Date().toISOString(), payload: { records, entities, ...(sourceMigration ? { sourceMigration } : {}) } } satisfies Operation);
    await tx.table('localState').put({ id: 'local', datasetId, deviceId, nextSequence: sequence + 1, headRevision: id } satisfies LocalState);
}
export function createPortfolioDatabase(name = 'my-portfolio'): Dexie {
    const db = new Dexie(name);
    db.version(1).stores(legacySchema);
    db.version(2).stores({ ...legacySchema, ...metadataSchema }).upgrade(async tx => { await legacyBaseline(tx, validateLegacyRecords(await readLegacyDomain(tx))); });
    db.version(3).stores({ ...legacySchema, ...metadataSchema }).upgrade(async tx => { await inspectLegacyIntegrity(tx); });
    // Dexie keeps removed stores readable during this callback and removes them only
    // after it succeeds. The entire versionchange (including v1/v2 steps) is atomic.
    db.version(4).stores({ ...nativeSchema, stocks: null }).upgrade(async tx => {
        await inspectLegacyIntegrity(tx);
        const state: LocalState = await tx.table('localState').get('local');
        if (state.nextSequence >= Number.MAX_SAFE_INTEGER) throw new Error('Exhausted device sequence. Records were retained.');
        const before = { records: await readLegacyDomain(tx), entities: await tx.table('entityStates').toArray() };
        const after = convertLegacySnapshot(before.records, before.entities, state.datasetId), id = newId();
        for (const store of domainStores) { await tx.table(store).clear(); await tx.table(store).bulkAdd(after.records[store]); }
        await tx.table('entityStates').clear(); await tx.table('entityStates').bulkAdd(after.entities);
        await sealLegacyOperations(tx);
        await appendOperation(tx, { id, operationVersion: 4, datasetId: state.datasetId, deviceId: state.deviceId, sequence: state.nextSequence, kind: 'migration', entityId: null, baseRevision: state.headRevision,
            createdAt: new Date().toISOString(), payload: { fromSchema: 3, toSchema: 4, before, after } } satisfies Operation);
        await tx.table('localState').put({ ...state, nextSequence: state.nextSequence + 1, headRevision: id });
        await inspectIdentityIntegrity(tx);
    });
    db.on('populate', tx => baseline(tx, { accounts: [], instruments: [], transactions: [], stockPrices: [] }));
    db.on('ready', () => db.transaction('r', allStores, () => inspectIdentityIntegrity(db)).then(() => undefined), true);
    const open = db.open.bind(db); db.open = () => Dexie.Promise.resolve(inspectLayout(name)).then(async layout => {
        if (layout) await migrateHistorical(name, layout, nativeSchema, async (tx, records, source) => {
            const identities = domainStores.flatMap(store => records[store].map(row => newEntity(store, row.id, newId(), row.id)));
            await baseline(tx, records, identities, source); await inspectIdentityIntegrity(tx);
        });
        return open();
    });
    return db;
}
function inspectLayout(name: string): Promise<HistoricalLayout | undefined> {
    return new Promise((resolve, reject) => {
        let fresh = false; const request = indexedDB.open(name);
        request.onupgradeneeded = () => { fresh = true; request.transaction?.abort(); };
        request.onerror = () => fresh ? resolve(undefined) : reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            try {
                const historical = historicalLayout(db); if (historical) { resolve(historical); return; }
                if (![10, 20, 30, 40].includes(db.version)) throw new HistoricalMigrationError('Unsupported historical or newer schema version. Records were retained.');
                const expected = db.version === 40 ? nativeSchema : db.version === 10 ? legacySchema : { ...legacySchema, ...metadataSchema };
                const names = Array.from(db.objectStoreNames);
                if (names.length !== Object.keys(expected).length || names.some(n => !Object.prototype.hasOwnProperty.call(expected, n))) throw new HistoricalMigrationError('Unsupported historical store layout. Records were retained.');
                const tx = db.transaction(names, 'readonly');
                for (const name of names) {
                    const store = tx.objectStore(name), fields = (expected as Record<string, string>)[name].split(',').map(v => v.trim());
                    if (store.keyPath !== fields[0] || store.autoIncrement || Array.from(store.indexNames).some(n => !fields.slice(1).map(v => v.replace(/^&/, '')).includes(n))) throw new HistoricalMigrationError('Unsupported historical identity/order layout. Records were retained.');
                }
                resolve(undefined);
            } catch (error) { reject(error); } finally { db.close(); }
        };
    });
}
