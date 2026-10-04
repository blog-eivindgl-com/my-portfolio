import Dexie, { Table } from 'dexie';
import { allStores, domainStores, domainKey, EntityState, LocalState, newEntity, newId, Operation } from './types/foundation';
import { PortfolioRecords, validateRecords, validateIdentity } from '../services/backupFormat';
interface TableAccess { table(name: string): Table; }

export const legacySchema = {
    stocks: 'ticker, name', accounts: 'id, name',
    transactions: 'id, timestamp, type, ticker, accountId, date, description, shares, price, brokerage',
    stockPrices: 'id, ticker, date, price',
};
export async function readDomain(db: TableAccess): Promise<PortfolioRecords> {
    const [accounts, stocks, transactions, stockPrices] = await Promise.all(domainStores.map(store => db.table(store).toArray()));
    return { accounts, stocks, transactions, stockPrices };
}
// Caller owns one transaction covering all seven stores. Restores fork a dataset;
// pending operations/device identity are never imported from another browser.
export async function baseline(tx: TableAccess, records: PortfolioRecords, identities?: EntityState[]): Promise<void> {
    const previous: LocalState | undefined = await tx.table('localState').get('local');
    const id = newId(), datasetId = newId(), deviceId = previous?.deviceId || newId();
    const sequence = previous?.nextSequence ?? 1;
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid or exhausted device sequence.');
    const knownIds = new Map(identities?.map(entity => [entity.key, entity.entityId]));
    const entities = domainStores.flatMap(store => records[store].map(row => {
        const key = domainKey(store, row);
        return newEntity(store, key, id, knownIds.get(JSON.stringify([store, key])));
    }));
    // Deleted identities survive recovery even though they have no live domain row.
    entities.push(...(identities || []).filter(entity => entity.deleted).map(entity => ({ ...entity, revision: id })));
    await tx.table('entityStates').clear();
    await tx.table('outbox').clear();
    await tx.table('entityStates').bulkAdd(entities);
    const operation: Operation = { id, operationVersion: entities.some(entity => entity.deleted) ? 2 : 1, datasetId, deviceId, sequence, kind: 'baseline', entityId: null, baseRevision: null,
        createdAt: new Date().toISOString(), payload: { records, entities } };
    await tx.table('outbox').add(operation);
    await tx.table('localState').put({ id: 'local', datasetId, deviceId, nextSequence: sequence + 1, headRevision: id } satisfies LocalState);
}
export function createPortfolioDatabase(name = 'my-portfolio'): Dexie {
    const db = new Dexie(name);
    db.version(1).stores(legacySchema);
    db.version(2).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' })
        .upgrade(async tx => {
            // Strict validation refuses ambiguous historical variants; throwing aborts
            // the entire versionchange, preserving the old database for recovery.
            const records = validateRecords(await readDomain(tx));
            await baseline(tx, records);
        });
    // The layout is unchanged, but older writers must not open tombstone-bearing data.
    db.version(3).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' })
        .upgrade(async tx => {
            const state: LocalState = await tx.table('localState').get('local');
            const identity = validateIdentity({ datasetId: state?.datasetId, entities: await tx.table('entityStates').toArray() }, validateRecords(await readDomain(tx)));
            if (identity.entities.some(entity => entity.deleted)) throw new Error('Unexpected deletion marker in version 2. Records were retained.');
        });
    db.on('populate', tx => baseline(tx, { accounts: [], stocks: [], transactions: [], stockPrices: [] }));
    const originalOpen = db.open.bind(db);
    db.open = () => Dexie.Promise.resolve(inspectLegacyLayout(name)).then(() => originalOpen());
    return db;
}
export { allStores };

// Inspect the actual version-1 layout before Dexie changes any store/index.
// Unknown stores must never be implicitly removed by a schema declaration.
function inspectLegacyLayout(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let fresh = false;
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => { fresh = true; request.transaction?.abort(); };
        request.onerror = () => fresh ? resolve() : reject(request.error);
        request.onsuccess = () => {
            const native = request.result;
            try {
                if (native.version < 30 && native.version !== 10 && native.version !== 20) throw new Error('Unsupported historical schema version. Records were retained.');
                if (native.version === 10 || native.version === 20) {
                    const stores = Array.from(native.objectStoreNames);
                    const expectedStores = native.version === 10 ? domainStores : allStores;
                    if (stores.length !== expectedStores.length || stores.some(store => !(expectedStores as readonly string[]).includes(store))) throw new Error('Unsupported historical store layout. Records were retained; use recovery-only export.');
                    const transaction = native.transaction(stores, 'readonly');
                    for (const store of domainStores) {
                        const table = transaction.objectStore(store);
                        const expected = store === 'stocks' ? 'ticker' : 'id';
                        const allowedIndexes = legacySchema[store].split(',').slice(1).map(field => field.trim());
                        if (table.keyPath !== expected || table.autoIncrement || Array.from(table.indexNames).some(index => !allowedIndexes.includes(index))) throw new Error('Unsupported historical identity/order layout. Records were retained; use recovery-only export.');
                    }
                    if (native.version === 20) for (const store of ['localState', 'entityStates', 'outbox']) {
                        const table = transaction.objectStore(store), expected = store === 'entityStates' ? 'key' : 'id';
                        if (table.keyPath !== expected || table.autoIncrement) throw new Error('Unsupported foundation identity layout. Records were retained.');
                    }
                }
                resolve();
            } catch (error) { reject(error); }
            finally { native.close(); }
        };
    });
}
