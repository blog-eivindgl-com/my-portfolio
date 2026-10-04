import { IdentitySnapshot, EntityState, domainKey, entityKey, newEntity, newId } from '../database/types/foundation';
import { IAccount, IStock, IStockPrice, ITransaction } from '../database/types/types';
import { validateTransaction } from './transactionValidation';

export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;
export const BACKUP_MAX_RECORDS = 100_000;
export const storeNames = ['accounts', 'stocks', 'transactions', 'stockPrices'] as const;
export type StoreName = typeof storeNames[number];
export interface PortfolioRecords {
    accounts: IAccount[];
    stocks: IStock[];
    transactions: ITransaction[];
    stockPrices: IStockPrice[];
}
export interface PortfolioBackup {
    format: 'my-portfolio-backup';
    formatVersion: 3;
    databaseVersion: 3;
    exportedAt: string;
    records: PortfolioRecords;
    identity: IdentitySnapshot;
}
export type RestoreMode = 'merge' | 'replace';
export type RecordCounts = Record<StoreName, number>;
export class BackupError extends Error {
    constructor(message: string) { super(message); this.name = 'BackupError'; }
}

function object(value: unknown, fields: readonly string[], path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BackupError(`${path}: expected an object.`);
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length !== fields.length || fields.some(key => !Object.prototype.hasOwnProperty.call(row, key))) {
        throw new BackupError(`${path}: missing or unsupported fields. No records were changed.`);
    }
    return row;
}

function text(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BackupError(`${path}: expected nonempty text.`);
    return value;
}

function number(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) throw new BackupError(`${path}: expected a finite number without negative zero.`);
    return value;
}

export function recordKey(store: StoreName, row: IAccount | IStock | IStockPrice | ITransaction): string {
    return store === 'stocks' ? (row as IStock).ticker : (row as IAccount).id;
}

export function validateRecords(value: unknown): PortfolioRecords {
    const source = object(value, storeNames, 'records');
    let total = 0;
    for (const store of storeNames) {
        if (!Array.isArray(source[store])) throw new BackupError(`records.${store}: expected an array.`);
        total += (source[store] as unknown[]).length;
    }
    if (total > BACKUP_MAX_RECORDS) throw new BackupError(`Backup exceeds ${BACKUP_MAX_RECORDS} records.`);
    const accounts = (source.accounts as unknown[]).map((value, index) => {
        const path = `accounts[${index}]`;
        const row = object(value, ['id', 'name'], path);
        return { id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`) };
    });
    const stocks = (source.stocks as unknown[]).map((value, index) => {
        const path = `stocks[${index}]`;
        const row = object(value, ['ticker', 'name'], path);
        return { ticker: text(row.ticker, `${path}.ticker`), name: text(row.name, `${path}.name`) };
    });
    const transactions = (source.transactions as unknown[]).map((value, index) => {
        const path = `transactions[${index}]`;
        const hasTime = !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'tradeTime');
        const row = object(value, ['id', 'type', 'ticker', 'accountId', 'date', 'description', 'shares', 'price', 'brokerage', ...(hasTime ? ['tradeTime'] : [])], path);
        try { validateTransaction(row); } catch { throw new BackupError(`${path}: invalid transaction fields or trade date.`); }
        for (const field of ['type', 'date', 'shares', 'price', 'brokerage']) number(row[field], `${path}.${field}`);
        // Validate without normalizing: preserve descriptions and all numeric values exactly.
        return {
            id: row.id as string, type: row.type as number, ticker: row.ticker as string,
            accountId: row.accountId as string, date: row.date as number, description: row.description as string,
            shares: row.shares as number, price: row.price as number, brokerage: row.brokerage as number,
            ...(hasTime ? { tradeTime: row.tradeTime as string } : {}),
        };
    });
    const stockPrices = (source.stockPrices as unknown[]).map((value, index) => {
        const path = `stockPrices[${index}]`;
        const row = object(value, ['id', 'ticker', 'date', 'price'], path);
        const date = number(row.date, `${path}.date`);
        const price = number(row.price, `${path}.price`);
        if (!Number.isFinite(new Date(date).getTime()) || price <= 0) throw new BackupError(`${path}: invalid date or nonpositive price.`);
        return { id: text(row.id, `${path}.id`), ticker: text(row.ticker, `${path}.ticker`), date, price };
    });
    const records = { accounts, stocks, transactions, stockPrices };
    for (const store of storeNames) {
        const ids = new Set<string>();
        records[store].forEach((row, index) => {
            const key = recordKey(store, row);
            if (ids.has(key)) throw new BackupError(`${store}[${index}]: duplicate record identity.`);
            ids.add(key);
        });
    }
    const accountIds = new Set(accounts.map(row => row.id));
    const tickers = new Set(stocks.map(row => row.ticker));
    transactions.forEach((row, index) => {
        if (!accountIds.has(row.accountId) || !tickers.has(row.ticker)) throw new BackupError(`transactions[${index}]: missing account or instrument reference.`);
    });
    stockPrices.forEach((row, index) => {
        if (!tickers.has(row.ticker)) throw new BackupError(`stockPrices[${index}]: missing instrument reference.`);
    });
    return records;
}

export function validateBackup(value: unknown): PortfolioBackup {
    if (value && typeof value === 'object' && (value as Record<string, unknown>).format === 'my-portfolio-recovery-only') {
        throw new BackupError('This is a recovery-only archive, not a directly importable backup. Keep it for reviewed recovery/migration; no records were changed.');
    }
    const source = object(value, ['format', 'formatVersion', 'databaseVersion', 'exportedAt', 'records', 'identity'], 'backup');
    const legacy = source.formatVersion === 2 && source.databaseVersion === 2;
    if (source.format !== 'my-portfolio-backup' || (!legacy && (source.formatVersion !== 3 || source.databaseVersion !== 3))) {
        throw new BackupError('Unsupported backup format or database version. Use a compatible app; no migration was attempted.');
    }
    if (typeof source.exportedAt !== 'string' || !Number.isFinite(Date.parse(source.exportedAt))
        || new Date(source.exportedAt).toISOString() !== source.exportedAt) throw new BackupError('backup.exportedAt: expected an ISO timestamp.');
    const records = validateRecords(source.records), identity = validateIdentity(source.identity, records);
    if (legacy && identity.entities.some(entity => entity.deleted)) throw new BackupError('Format 2 cannot contain deletion markers.');
    return { format: 'my-portfolio-backup', formatVersion: 3, databaseVersion: 3, exportedAt: source.exportedAt, records, identity };
}

export function parseBackup(content: string): PortfolioBackup {
    if (new TextEncoder().encode(content).length > BACKUP_MAX_BYTES) throw new BackupError('Backup exceeds the 10 MiB limit.');
    let value: unknown;
    try { value = JSON.parse(content); } catch { throw new BackupError('The file is not valid JSON. No records were changed.'); }
    return validateBackup(value);
}

export function createBackup(records: unknown, identity?: IdentitySnapshot): PortfolioBackup {
    return { format: 'my-portfolio-backup', formatVersion: 3, databaseVersion: 3, exportedAt: new Date().toISOString(), records: validateRecords(records), identity: validateIdentity(identity || makeIdentity(validateRecords(records)), validateRecords(records)) };
}

export function serializeBackup(backup: PortfolioBackup): string {
    const content = JSON.stringify(validateBackup(backup), null, 2);
    if (new TextEncoder().encode(content).length > BACKUP_MAX_BYTES) throw new BackupError('Backup exceeds the supported 10 MiB limit. No restore can proceed.');
    return content;
}

export function canonicalRecords(records: PortfolioRecords): string {
    const sorted: Record<string, unknown> = {};
    for (const store of storeNames) {
        sorted[store] = [...records[store]].sort((a, b) => {
            const left = recordKey(store, a), right = recordKey(store, b);
            return left < right ? -1 : left > right ? 1 : 0;
        }).map(row => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
    }
    return JSON.stringify(sorted);
}

export function counts(records: PortfolioRecords): RecordCounts {
    return Object.fromEntries(storeNames.map(store => [store, records[store].length])) as RecordCounts;
}

export function combineRecords(current: PortfolioRecords, incoming: PortfolioRecords, mode: RestoreMode) {
    if (mode !== 'merge' && mode !== 'replace') throw new BackupError('Choose Merge or Replace explicitly.');
    const result: Record<string, unknown[]> = {};
    const conflicts: string[] = [];
    let identical = 0;
    for (const store of storeNames) {
        if (mode === 'replace') { result[store] = incoming[store]; continue; }
        const existing = new Map(current[store].map(row => [recordKey(store, row), row]));
        result[store] = [...current[store]];
        incoming[store].forEach((row, index) => {
            const match = existing.get(recordKey(store, row));
            if (!match) result[store].push(row);
            else if (JSON.stringify(match) === JSON.stringify(row)) identical++;
            else conflicts.push(`${store}[${index}] has an existing identity with different values.`);
        });
    }
    return { records: validateRecords(result), conflicts, identical };
}

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function makeIdentity(records: PortfolioRecords): IdentitySnapshot {
    const revision = newId();
    return { datasetId: newId(), entities: storeNames.flatMap(store => records[store].map(row => newEntity(store, domainKey(store, row), revision))) };
}
export function validateIdentity(value: unknown, records: PortfolioRecords): IdentitySnapshot {
    const source = object(value, ['datasetId', 'entities'], 'identity');
    if (!uuid(source.datasetId) || !Array.isArray(source.entities)) throw new BackupError('Invalid dataset identity.');
    const expected = new Set(storeNames.flatMap(store => records[store].map(row => entityKey(store, recordKey(store, row)))));
    if (source.entities.length > BACKUP_MAX_RECORDS) throw new BackupError('Backup exceeds the record and deletion-marker limit.');
    const ids = new Set<string>(), keys = new Set<string>();
    const entities = source.entities.map((value, index) => {
        const row = object(value, ['key', 'store', 'recordKey', 'entityId', 'revision', 'deleted', 'tradeOrder', 'currency', 'instrumentKind'], `identity.entities[${index}]`);
        if (!storeNames.includes(row.store as StoreName) || typeof row.recordKey !== 'string' || !row.recordKey.trim() || row.key !== entityKey(row.store as StoreName, row.recordKey)
            || keys.has(row.key as string) || !uuid(row.entityId) || ids.has(row.entityId) || !uuid(row.revision)
            || typeof row.deleted !== 'boolean' || row.tradeOrder !== null || row.currency !== null || row.instrumentKind !== null
            || (row.deleted ? row.store !== 'transactions' || expected.has(row.key as string) : !expected.delete(row.key as string))) throw new BackupError('Invalid, duplicate or unsupported entity identity metadata.');
        ids.add(row.entityId); keys.add(row.key as string);
        return { key: row.key, store: row.store, recordKey: row.recordKey, entityId: row.entityId, revision: row.revision,
            deleted: row.deleted, tradeOrder: null, currency: null, instrumentKind: null } as EntityState;
    });
    if (expected.size) throw new BackupError('Identity snapshot must cover every record exactly once.');
    return { datasetId: source.datasetId, entities };
}
export function canonicalSnapshot(backup: PortfolioBackup): string {
    return JSON.stringify({ records: canonicalRecords(backup.records), datasetId: backup.identity.datasetId,
        entities: [...backup.identity.entities].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) });
}
