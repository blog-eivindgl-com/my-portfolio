import { HistoricalMigrationError } from './HistoricalMigrationError';
import Dexie, { Transaction } from 'dexie';
import { validateRecords as legacyRecords } from '../legacy/services/backupFormat';
import { validateRecords, PortfolioRecords } from '../services/backupFormat';
import { isUuid } from '../services/instrumentValidation';

export const historicalSchemas = {
    'numeric-v1': { stocks: 'ticker,name', accounts: '++id,name', transactions: '++id,type,ticker,accountId,date,description,shares,price,brokerage' },
    'ordered-v1': { stocks: 'ticker,name', accounts: 'id,name', transactions: 'id,timestamp,order,type,ticker,accountId,date,description,shares,price,brokerage', stockPrices: 'id,ticker,date,price' },
} as const;
export type HistoricalLayout = keyof typeof historicalSchemas;
export interface HistoricalSource {
    layout: HistoricalLayout;
    records: { accounts: any[]; stocks: any[]; transactions: any[]; stockPrices?: any[] };
    mapping: { accounts: { from: number | string; to: string }[]; instruments: { from: string; to: string }[]; transactions: { from: number | string; to: string }[] };
}
const refuse = (detail: string): never => { throw new HistoricalMigrationError(`Historical migration refused: ${detail}. Records were retained.`); };
function keys(value: any, expected: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.prototype.hasOwnProperty.call(value, key))) refuse('unknown source fields or missing evidence');
}
export function convertHistorical(source: HistoricalSource): PortfolioRecords {
    keys(source, ['layout', 'records', 'mapping']);
    if (!Object.prototype.hasOwnProperty.call(historicalSchemas, source.layout)) refuse('unsupported source layout');
    const numeric = source.layout === 'numeric-v1', records = source.records;
    keys(records, ['accounts', 'stocks', 'transactions', ...(!numeric ? ['stockPrices'] : [])]);
    if (Object.values(records).some(rows => !Array.isArray(rows)) || Object.values(records).reduce((sum, rows) => sum + rows.length, 0) > 100000) refuse('invalid or excessive source records');
    keys(source.mapping, ['accounts', 'instruments', 'transactions']);
    const mapped = (name: keyof HistoricalSource['mapping'], originals: (number | string)[]) => {
        const entries = source.mapping[name]; if (!Array.isArray(entries) || entries.length !== originals.length) refuse('incomplete key mapping');
        const map = new Map<number | string, string>();
        for (const entry of entries) { keys(entry, ['from', 'to']); if (!originals.includes(entry.from) || map.has(entry.from) || !isUuid(entry.to)) refuse('ambiguous key mapping'); map.set(entry.from, entry.to); }
        if (map.size !== originals.length) refuse('duplicate source keys'); return map;
    };
    for (const row of records.accounts) {
        keys(row, ['id', 'name']); if (numeric ? !Number.isSafeInteger(row.id) || row.id < 1 : !isUuid(row.id)) refuse('mixed or invalid account key types');
    }
    for (const row of records.transactions) {
        const hasOrder = Object.prototype.hasOwnProperty.call(row, 'order');
        keys(row, ['id', 'type', 'ticker', 'accountId', 'date', 'description', 'shares', 'price', 'brokerage', ...(!numeric && hasOrder ? ['order'] : [])]);
        if (numeric ? !Number.isSafeInteger(row.id) || row.id < 1 || !Number.isSafeInteger(row.accountId) : !isUuid(row.id) || !isUuid(row.accountId)) refuse('mixed or invalid transaction/reference key types');
        if (hasOrder && (!Number.isSafeInteger(row.order) || row.order < 0)) refuse('invalid explicit trade order');
    }
    const accounts = mapped('accounts', records.accounts.map(row => row.id)), instruments = mapped('instruments', records.stocks.map(row => row.ticker)), transactions = mapped('transactions', records.transactions.map(row => row.id));
    if (!numeric && (records.accounts.some(row => accounts.get(row.id) !== row.id) || records.transactions.some(row => transactions.get(row.id) !== row.id))) refuse('historical UUIDs must not be reassigned');
    const ids = [...Array.from(accounts.values()), ...Array.from(instruments.values()), ...Array.from(transactions.values()), ...(records.stockPrices || []).map(row => row.id)];
    if (ids.some(id => !isUuid(id)) || new Set(ids.map(id => id.toLowerCase())).size !== ids.length) refuse('case-aliased or colliding stable UUIDs');
    const legacy = legacyRecords({ accounts: records.accounts.map(row => ({ ...row, id: accounts.get(row.id) })), stocks: records.stocks,
        transactions: records.transactions.map(({ order: _order, ...row }) => ({ ...row, id: transactions.get(row.id), accountId: accounts.get(row.accountId) })), stockPrices: records.stockPrices || [] });
    const byInstrument = new Map<string, any[]>();
    for (const row of records.transactions) if (row.order !== undefined) { const group = byInstrument.get(row.ticker) || []; group.push(row); byInstrument.set(row.ticker, group); }
    for (const group of Array.from(byInstrument.values())) {
        if (new Set(group.map(row => row.order)).size !== group.length) refuse('duplicate count-based trade order; review the original trade confirmations');
        const sorted = [...group].sort((a, b) => a.order - b.order);
        if (sorted.some((row, i) => i > 0 && row.date < sorted[i - 1].date)) refuse('explicit order contradicts trade dates; review chronology');
    }
    const result = { accounts: legacy.accounts, instruments: legacy.stocks.map(row => ({ id: instruments.get(row.ticker)!, name: row.name, ticker: row.ticker, currency: null, instrumentKind: null, exchange: null, isin: null })),
        transactions: legacy.transactions.map((row, index) => { const { ticker, ...body } = row; return { ...body, instrumentId: instruments.get(ticker)!, ...(records.transactions[index].order !== undefined ? { tradeOrder: records.transactions[index].order } : {}) }; }),
        stockPrices: legacy.stockPrices.map(({ ticker, ...row }) => ({ ...row, instrumentId: instruments.get(ticker)! })) };
    return validateRecords(result);
}
export function makeHistoricalSource(layout: HistoricalLayout, records: HistoricalSource['records']): HistoricalSource {
    const source: HistoricalSource = { layout, records, mapping: {
        accounts: records.accounts.map(row => ({ from: row.id, to: layout === 'numeric-v1' ? crypto.randomUUID() : row.id })),
        instruments: records.stocks.map(row => ({ from: row.ticker, to: crypto.randomUUID() })),
        transactions: records.transactions.map(row => ({ from: row.id, to: layout === 'numeric-v1' ? crypto.randomUUID() : row.id })),
    } };
    try { convertHistorical(source); } catch (error) { if (error instanceof HistoricalMigrationError) throw error; refuse(error instanceof Error ? error.message : 'invalid source records'); } return source;
}
// Exact known v1 schemas only. In particular, timestamp *values* are not inferred
// from an index declaration: populated unknown fields are refused above.
export function historicalLayout(db: IDBDatabase): HistoricalLayout | undefined {
    if (db.version !== 10) return;
    for (const layout of Object.keys(historicalSchemas) as HistoricalLayout[]) {
        const schema: Record<string, string> = historicalSchemas[layout], names = Object.keys(schema);
        if (names.length !== db.objectStoreNames.length || names.some(name => !db.objectStoreNames.contains(name))) continue;
        const tx = db.transaction(names, 'readonly');
        if (names.every(name => { const store = tx.objectStore(name), fields = schema[name].split(','), auto = fields[0].startsWith('++');
            return store.keyPath === fields[0].replace('++', '') && store.autoIncrement === auto
                && store.indexNames.length === fields.length - 1 && fields.slice(1).every(index => store.indexNames.contains(index) && !store.index(index).unique && !store.index(index).multiEntry && store.index(index).keyPath === index);
        })) return layout;
    }
}
export async function migrateHistorical(name: string, layout: HistoricalLayout, nativeSchema: Record<string, string>, install: (tx: Transaction, records: PortfolioRecords, source: HistoricalSource) => Promise<void>): Promise<void> {
    const migration = new Dexie(name), schema = historicalSchemas[layout];
    migration.version(1).stores(schema);
    migration.version(2).stores({ ...schema, historicalSource: 'id' }).upgrade(async tx => {
        const records: any = {}; for (const store of Object.keys(schema)) records[store] = await tx.table(store).toArray();
        await tx.table('historicalSource').add({ id: 'source', source: makeHistoricalSource(layout, records) });
    });
    // Removing and recreating key paths in separate Dexie steps avoids in-place
    // primary-key alteration. All steps share the SAME versionchange transaction.
    migration.version(3).stores({ accounts: null, stocks: null, transactions: null, stockPrices: null, historicalSource: 'id' }).upgrade(() => undefined);
    migration.version(4).stores({ ...nativeSchema, historicalSource: null }).upgrade(async tx => {
        const saved = await tx.table('historicalSource').get('source'); if (!saved) refuse('missing staged source');
        const records = convertHistorical(saved.source); for (const store of ['accounts', 'instruments', 'transactions', 'stockPrices'] as const) await tx.table(store).bulkAdd(records[store]);
        await install(tx, records, saved.source);
    });
    try { await migration.open(); } finally { migration.close(); }
}
