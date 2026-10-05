import { foundationStores } from '../database/types/foundation';
import { BACKUP_MAX_BYTES, BACKUP_MAX_RECORDS, BackupError, storeNames } from './backupFormat';

// A forensic copy of the known portfolio fields, NOT an import/migration format.
// Tags retain undefined, nonfinite numbers, negative zero, dates and numeric IDs.
const fields = {
    accounts: ['id', 'name'], stocks: ['ticker', 'name'],
    transactions: ['id', 'type', 'ticker', 'accountId', 'date', 'description', 'shares', 'price', 'brokerage', 'timestamp', 'order', 'tradeTime'],
    stockPrices: ['id', 'ticker', 'date', 'price'],
};

function scalar(value: unknown): { type: string; value?: string | boolean } {
    if (value === null) return { type: 'null' };
    if (value === undefined) return { type: 'undefined' };
    if (typeof value === 'string' || typeof value === 'boolean') return { type: typeof value, value };
    if (typeof value === 'number') return { type: 'number', value: Object.is(value, -0) ? '-0' : String(value) };
    if (typeof value === 'bigint') return { type: 'bigint', value: String(value) };
    if (Object.prototype.toString.call(value) === '[object Date]') return { type: 'date', value: String(Date.prototype.getTime.call(value)) };
    throw new BackupError('Recovery archive cannot safely represent a nested/binary record value. No file was exported; retain browser storage for specialist recovery.');
}

export function exportRecoveryArchive(databaseName: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(databaseName);
        open.onupgradeneeded = () => open.transaction?.abort(); // Do not create or migrate a database.
        open.onerror = () => reject(new BackupError('Could not open existing browser storage for recovery. No file was exported.'));
        open.onsuccess = () => {
            const db = open.result;
            const actualNames = Array.from(db.objectStoreNames);
            const excludedStores = actualNames.filter(name => (foundationStores as readonly string[]).includes(name));
            const names = actualNames.filter(name => !excludedStores.includes(name));
            if (!names.length || names.some(name => !storeNames.includes(name as typeof storeNames[number]))) {
                db.close(); reject(new BackupError('Recovery archive found unsupported stores. Nothing was exported to avoid including credentials or unrelated data.')); return;
            }
            const stores: Record<string, unknown> = {};
            const tx = db.transaction(names, 'readonly');
            let failure: unknown;
            let total = 0;
            tx.onabort = tx.onerror = () => { db.close(); reject(failure || new BackupError('Recovery read failed. No file was exported.')); };
            tx.oncomplete = () => {
                db.close();
                try {
                    const content = JSON.stringify({
                        format: 'my-portfolio-recovery-only', archiveVersion: 1, directlyImportable: false,
                        exportedAt: new Date().toISOString(), databaseVersion: db.version, excludedStores, stores,
                    }, null, 2);
                    if (new TextEncoder().encode(content).length > BACKUP_MAX_BYTES) throw new BackupError('Recovery archive exceeds 10 MiB. Retain browser storage for specialist recovery.');
                    resolve(content);
                } catch (error) { reject(error); }
            };
            for (const name of names) {
                const store = tx.objectStore(name);
                const entries: unknown[] = [];
                stores[name] = {
                    keyPath: store.keyPath, autoIncrement: store.autoIncrement,
                    indexes: Array.from(store.indexNames).map(indexName => {
                        const index = store.index(indexName);
                        return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
                    }), entries,
                };
                const cursor = store.openCursor();
                cursor.onsuccess = () => {
                    if (!cursor.result) return;
                    try {
                        if (++total > BACKUP_MAX_RECORDS) throw new BackupError('Recovery archive exceeds 100,000 records.');
                        const row: unknown = cursor.result.value;
                        if (Object.prototype.toString.call(row) !== '[object Object]') throw new BackupError('Unsupported record shape. Retain browser storage for specialist recovery.');
                        const record = row as Record<string, unknown>;
                        if (Object.keys(record).some(key => !fields[name as keyof typeof fields].includes(key))) throw new BackupError('Unsupported record fields. Nothing was exported to avoid leaking credentials or silently dropping data.');
                        entries.push({ key: scalar(cursor.result.primaryKey), fields: Object.keys(record).map(key => [key, scalar(record[key])]) });
                        cursor.result.continue();
                    } catch (error) { failure = error; tx.abort(); }
                };
            }
        };
    });
}
