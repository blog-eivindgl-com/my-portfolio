/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { HistoricalMigrationError } from '@/app/database/HistoricalMigrationError';
import { createPortfolioDatabase, allStores } from '@/app/database/foundation';
import { historicalSchemas, convertHistorical } from '@/app/database/historicalMigration';
import BackupService from '@/app/services/BackupService';
import PortfolioRepository from '@/app/services/PortfolioRepository';
import { orderTransactions } from '@/app/services/tradeChronology';
import numeric from '../../test-fixtures/database/numeric-v1.json';
import ordered from '../../test-fixtures/database/ordered-v1.json';
let db: Dexie, serial = 0;
beforeEach(() => { jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-historical-${++serial}`); });
afterEach(async () => { db.close(); await db.delete(); });
async function seed(fixture: any) { const raw = new Dexie(db.name); raw.version(1).stores(fixture.stores); await raw.open(); for (const [store, rows] of Object.entries(fixture.records)) await raw.table(store).bulkAdd(rows as any[]); const before = await rawSnapshot(raw); raw.close(); return before; }
async function rawSnapshot(raw: Dexie) { const rows: any = {}; for (const table of raw.tables) rows[table.name] = await table.toArray(); return { version: raw.verno, records: rows }; }
it.each([numeric, ordered])('migrates exact historical $sourceRevision atomically with source evidence and native references', async fixture => {
    const before = await seed(fixture); await db.open(); expect(db.verno).toBe(4); expect(db.tables.map(t => t.name).sort()).toEqual([...allStores].sort());
    const baseline = (await db.table('outbox').toArray())[0], source = baseline.payload.sourceMigration; expect(source.records).toEqual(before.records);
    const converted = convertHistorical(source); expect(await db.table('transactions').toArray()).toEqual([...converted.transactions].sort((a,b) => a.id.localeCompare(b.id)));
    for (let i=0; i<source.records.transactions.length; i++) { const original = source.records.transactions[i], mapped = converted.transactions[i];
        for (const field of ['date','type','description','shares','price','brokerage']) expect(mapped[field]).toBe(original[field]);
        expect(converted.accounts.some(a => a.id === mapped.accountId)).toBe(true); expect(converted.instruments.some(a => a.id === mapped.instrumentId)).toBe(true);
        expect(mapped.tradeOrder).toBe(original.order); expect(mapped).not.toHaveProperty('tradeTime');
    }
    const snapshot = await rawSnapshot(db); db.close(); await db.open(); expect(await rawSnapshot(db)).toEqual(snapshot);
    const service = new BackupService(db), backup = await service.exportBackup(), preview = await service.preview(backup, 'replace'); await service.restore(preview, preview.recoveryText);
    expect(await db.table('transactions').toArray()).toEqual(snapshot.records.transactions); db.close(); await db.open();
});
it.each(['duplicate order', 'contradictory dates', 'timestamp values', 'mixed key', 'orphan', 'extra field'])('refuses ambiguous/corrupt historical evidence without reset: %s', async fault => {
    const fixture = structuredClone(ordered) as any;
    if (fault === 'duplicate order') fixture.records.transactions[1].order = 0;
    if (fault === 'contradictory dates') fixture.records.transactions[1].date = fixture.records.transactions[0].date - 86400000;
    if (fault === 'timestamp values') fixture.records.transactions[0].timestamp = 123;
    if (fault === 'mixed key') fixture.records.accounts[0].id = 1;
    if (fault === 'orphan') fixture.records.transactions[0].accountId = crypto.randomUUID();
    if (fault === 'extra field') fixture.records.stocks[0].currency = 'NOK';
    const before = await seed(fixture); await expect(db.open()).rejects.toBeInstanceOf(HistoricalMigrationError); db.close(); const raw = new Dexie(db.name); await raw.open(); try { expect(await rawSnapshot(raw)).toEqual(before); } finally { raw.close(); }
});
it('retains missing order as unknown and uses only complete explicit same-day order', async () => {
    const fixture = structuredClone(ordered); fixture.records.transactions[1].date = fixture.records.transactions[0].date; await seed(fixture); await db.open();
    const rows = await db.table('transactions').toArray(); expect(orderTransactions([...rows].reverse()).transactions.map(t => t.tradeOrder)).toEqual([0,1]); expect(orderTransactions(rows).warnings).toEqual([]);
    expect(orderTransactions(rows.map((row, i) => i ? { ...row, tradeOrder: undefined } : row)).warnings).toHaveLength(1);
    const repo = new PortfolioRepository(db), snapshot = await repo.getTransaction(rows[0].id), target = { commandId: crypto.randomUUID(), datasetId: snapshot.datasetId, entityId: snapshot.entity.entityId, expectedRevision: snapshot.entity.revision, transactionId: rows[0].id };
    await repo.updateTransaction(target, { ...snapshot.record, price: 123 }); await repo.updateTransaction(target, { ...snapshot.record, price: 123 });
    expect((await db.table('transactions').get(rows[0].id)).tradeOrder).toBe(0); db.close(); await db.open();
});
it('permits a legacy record whose order was never populated without inventing one', async () => {
    const fixture: any = structuredClone(ordered); delete fixture.records.transactions[0].order; await seed(fixture); await db.open();
    expect(await db.table('transactions').get(fixture.records.transactions[0].id)).not.toHaveProperty('tradeOrder');
});
it('rolls back after original stores were staged/deleted when baseline persistence fails, then retries intact source', async () => {
    const before = await seed(numeric); const original = IDBObjectStore.prototype.add;
    const spy = jest.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, value: any, key?: IDBValidKey) {
        if (this.name === 'operationDigests') throw new Error('Synthetic interruption'); return original.call(this, value, key);
    });
    await expect(db.open()).rejects.toThrow(); spy.mockRestore(); db.close(); const raw = new Dexie(db.name); await raw.open(); expect(await rawSnapshot(raw)).toEqual(before); raw.close();
    await db.open(); expect(await db.table('transactions').count()).toBe(2); db.close(); await db.open();
});
it('serializes two concurrent historical upgrades to one migration baseline', async () => {
    await seed(numeric); const other = createPortfolioDatabase(db.name); try { await Promise.all([db.open(), other.open()]); expect(await db.table('outbox').count()).toBe(1); expect(await db.table('operationDigests').count()).toBe(1); } finally { other.close(); }
});
it('preserves separate numeric accounts, reused numeric key spaces and fractional values', async () => {
    const fixture = structuredClone(numeric); fixture.records.accounts.push({ id: 2, name: 'Second synthetic account' });
    fixture.records.transactions.push({ ...fixture.records.transactions[0], id: 3, accountId: 2, shares: 0.125, price: 12.34, brokerage: 0.005, description: ' preserve exact fractions ' });
    await seed(fixture); await db.open(); const baseline = (await db.table('outbox').toArray())[0], source = baseline.payload.sourceMigration;
    const id = source.mapping.transactions.find((entry: any) => entry.from === 3).to, account = source.mapping.accounts.find((entry: any) => entry.from === 2).to;
    expect(await db.table('transactions').get(id)).toMatchObject({ accountId: account, shares: 0.125, price: 12.34, brokerage: 0.005, description: ' preserve exact fractions ' });
    expect(source.mapping.accounts[0].to).not.toBe(source.mapping.transactions[0].to); db.close(); await db.open();
});
it('refuses source UUID aliasing across entities and preserves all source records', async () => {
    const fixture = structuredClone(ordered); fixture.records.transactions[0].id = fixture.records.accounts[0].id;
    const before = await seed(fixture); await expect(db.open()).rejects.toThrow('colliding'); db.close(); const raw = new Dexie(db.name); await raw.open(); try { expect(await rawSnapshot(raw)).toEqual(before); } finally { raw.close(); }
});
it('verifies source mapping evidence again on restart', async () => {
    await seed(numeric); await db.open(); const operation = (await db.table('outbox').toArray())[0]; operation.payload.sourceMigration.mapping.accounts[0].from = 999;
    await db.table('outbox').put(operation); db.close(); await expect(db.open()).rejects.toThrow(); db.close(); const raw = new Dexie(db.name); await raw.open();
    try { expect((await raw.table('outbox').get(operation.id)).payload.sourceMigration.mapping.accounts[0].from).toBe(999); expect(await raw.table('transactions').count()).toBe(2); } finally { raw.close(); }
});
it('migrates the actual UUID v1 fixture without changing its record keys', async () => {
    const fixture = (await import('../../test-fixtures/database/uuid-v1.json')).default; await seed(fixture); await db.open();
    expect((await db.table('accounts').toArray()).map(row => row.id)).toEqual(fixture.records.accounts.map(row => row.id));
    expect((await db.table('transactions').toArray()).map(row => row.id)).toEqual(fixture.records.transactions.map(row => row.id)); db.close(); await db.open();
});
