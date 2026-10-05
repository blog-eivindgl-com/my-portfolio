/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createPortfolioDatabase, allStores } from '@/app/database/foundation';
import { createPortfolioDatabase as legacyDatabase } from '@/app/legacy/database/foundation';
import LegacyRepository from '@/app/legacy/services/PortfolioRepository';
import PortfolioRepository from '@/app/services/PortfolioRepository';
import BackupService from '@/app/services/BackupService';
import { inspectIdentityIntegrity } from '@/app/database/identityIntegrity';
const id = 'abcdef00-0000-4000-8000-000000000001';
const instrument = { id, name: 'Synthetic fund', ticker: null, instrumentKind: 'fund' as const, currency: 'NOK', exchange: null, isin: null };
const trade = { id: 'trade', accountId: 'account', instrumentId: id, type: 0, date: Date.UTC(2024, 0, 1), shares: 0.125, price: 12.34, brokerage: 0, description: ' kept ' };
let db: Dexie; let serial = 0;
beforeEach(() => { jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-native-${++serial}`); });
afterEach(async () => { db.close(); await db.delete(); });
it('creates native instrument and relationships and restarts with a verified format-4 backup', async () => {
    await db.open(); const repo = new PortfolioRepository(db);
    await repo.createAccount({ id: 'account', name: 'Account' }); await repo.createInstrument(instrument); await repo.createTransaction(trade);
    expect(db.table('instruments').schema.primKey.keyPath).toBe('id');
    expect(await db.table('instruments').get(id)).toEqual(instrument);
    expect((await db.table('transactions').get('trade')).instrumentId).toBe(id);
    db.close(); await db.open();
    const backup = JSON.parse(await new BackupService(db).exportBackup()); expect(backup.formatVersion).toBe(4);
    expect(backup.identity.entities.find((e: any) => e.store === 'instruments').entityId).toBe(id);
});
it('migrates v3 keys while retaining old operations, UUIDs, revision, history and values', async () => {
    const old = legacyDatabase(db.name); await old.open(); const repo = new LegacyRepository(old);
    await repo.createAccount({ id: 'account', name: 'Account' }); await repo.createInstrument({ ticker: 'SYNTH', name: 'Legacy' });
    const { instrumentId: _id, ...body } = trade; await repo.createTransaction({ ...body, ticker: 'SYNTH' });
    const before = await old.table('outbox').toArray(), states = await old.table('entityStates').toArray(), state = await old.table('localState').get('local'); old.close();
    await db.open(); const entity = states.find(e => e.store === 'stocks');
    expect(await db.table('instruments').get(entity.entityId)).toMatchObject({ id: entity.entityId, ticker: 'SYNTH', name: 'Legacy', currency: null });
    for (const operation of before) expect(await db.table('outbox').get(operation.id)).toEqual(operation);
    expect((await db.table('transactions').get('trade')).instrumentId).toBe(entity.entityId);
    expect((await db.table('entityStates').get(JSON.stringify(['instruments', entity.entityId]))).revision).toBe(entity.revision);
    expect((await db.table('localState').get('local')).datasetId).toBe(state.datasetId);
    db.close(); await db.open(); await db.transaction('r', allStores, () => inspectIdentityIntegrity(db));
});

async function snapshot(database = db) { return database.transaction('r', allStores, () => Promise.all(allStores.map(store => database.table(store).toArray()))); }
it.each(['entityStates', 'outbox', 'operationDigests', 'localState'])('rolls back every native store when %s fails, then retries once', async store => {
    await db.open(); const repo = new PortfolioRepository(db), before = await snapshot();
    const spy = jest.spyOn(db.table(store), store === 'localState' ? 'put' : 'add').mockRejectedValueOnce(new Error('Synthetic failure'));
    await expect(repo.createInstrument(instrument)).rejects.toThrow('Synthetic failure'); expect(await snapshot()).toEqual(before); spy.mockRestore();
    await repo.createInstrument(instrument); await repo.createInstrument(instrument);
    expect(await db.table('outbox').count()).toBe(2); expect(await db.table('operationDigests').count()).toBe(2);
    db.close(); await db.open();
});
it('serializes native UUID creation across connections without duplicate receipts or sequence gaps', async () => {
    await db.open(); const other = createPortfolioDatabase(db.name); await other.open();
    try { await Promise.all([new PortfolioRepository(db).createInstrument(instrument), new PortfolioRepository(other).createInstrument(instrument)]);
        expect(await db.table('instruments').count()).toBe(1); expect((await db.table('outbox').toArray()).map(r => r.sequence).sort()).toEqual([1, 2]);
        expect(await db.table('operationDigests').count()).toBe(2);
    } finally { other.close(); }
    db.close(); await db.open();
});
it('rejects case-folded UUID collisions and dangling references without partial writes', async () => {
    await db.open(); const repo = new PortfolioRepository(db); await repo.createInstrument(instrument); await repo.createAccount({ id: 'account', name: 'A' }); const before = await snapshot();
    await expect(repo.createInstrument({ ...instrument, id: id.toUpperCase() })).rejects.toThrow();
    await expect(repo.createTransaction({ ...trade, instrumentId: 'missing' })).rejects.toThrow(); expect(await snapshot()).toEqual(before);
});
it('retains duplicate optional tickers as separate identities and refuses an ambiguous legacy route', async () => {
    const { resolveInstrument } = await import('@/app/services/instrumentLookup');
    await db.open(); const repo = new PortfolioRepository(db); await repo.createInstrument({ ...instrument, ticker: 'DUP' });
    const second = { ...instrument, id: 'abcdef00-0000-4000-8000-000000000002', ticker: 'DUP' }; await repo.createInstrument(second);
    await expect(resolveInstrument('DUP', db)).rejects.toThrow('multiple'); expect(await resolveInstrument(second.id, db)).toEqual(second);
    await repo.createInstrument({ ...instrument, id: 'abcdef00-0000-4000-8000-000000000003' }); db.close(); await db.open();
});
it('detects hash-only tampering after restart and retains the evidence', async () => {
    await db.open(); await new PortfolioRepository(db).createInstrument(instrument); const digest = (await db.table('operationDigests').toArray())[0];
    await db.table('operationDigests').put({ ...digest, contentHash: 'tampered' }); const before = await snapshot(); db.close();
    await expect(db.open()).rejects.toThrow('integrity'); db.close();
    const raw = new Dexie(db.name); await raw.open(); try { expect(await snapshot(raw)).toEqual(before); } finally { raw.close(); }
});
it('rolls back an interruption after reference conversion and retries the intact v3 source', async () => {
    const old = legacyDatabase(db.name); await old.open(); const repo = new LegacyRepository(old); await repo.createInstrument({ ticker: 'SYNTH', name: 'Legacy' });
    const names = old.tables.map(t => t.name), before = await Promise.all(names.map(n => old.table(n).toArray())); old.close();
    const fail = () => { throw new Error('Synthetic interrupted digest persistence'); }; db.table('operationDigests').hook('creating', fail);
    await expect(db.open()).rejects.toThrow(); db.close(); const raw = new Dexie(db.name); await raw.open();
    try { expect(raw.verno).toBe(3); expect(await Promise.all(names.map(n => raw.table(n).toArray()))).toEqual(before); expect(raw.tables.map(t => t.name)).not.toContain('instruments'); } finally { raw.close(); }
    db.table('operationDigests').hook('creating').unsubscribe(fail); await db.open(); expect(await db.table('instruments').count()).toBe(1); db.close(); await db.open();
});
it('preserves legacy rename/update/delete receipts and tombstones through migration and retry', async () => {
    const old = legacyDatabase(db.name); await old.open(); const repo = new LegacyRepository(old);
    await repo.createAccount({ id: 'account', name: 'A' }); await repo.createInstrument({ ticker: 'SYNTH', name: 'Legacy' });
    const { instrumentId: _id, ...body } = trade; await repo.createTransaction({ ...body, ticker: 'SYNTH' });
    const named = await repo.getNamedEntity('stocks', 'SYNTH');
    const nameTarget = { commandId: crypto.randomUUID(), datasetId: named.datasetId, entityId: named.entity.entityId, expectedRevision: named.entity.revision, recordKey: 'SYNTH' };
    await repo.renameInstrument(nameTarget, 'Renamed');
    const first = await repo.getTransaction('trade'); const target = { commandId: crypto.randomUUID(), datasetId: first.datasetId, entityId: first.entity.entityId, expectedRevision: first.entity.revision, transactionId: 'trade' };
    const corrected = { ...first.record, price: 13 }; const update = await repo.updateTransaction(target, corrected);
    const removal = { ...target, commandId: crypto.randomUUID(), expectedRevision: update.revision }; const deleted = await repo.deleteTransaction(removal);
    const prefix = await old.table('outbox').toArray(); old.close(); await db.open(); const native = new PortfolioRepository(db), before = await snapshot();
    const { ticker: _ticker, ...nativeRecord } = corrected;
    await native.renameInstrument(nameTarget, 'Renamed'); await native.updateTransaction(target, { ...nativeRecord, instrumentId: named.entity.entityId });
    expect(await native.deleteTransaction(removal)).toEqual(deleted); expect(await snapshot()).toEqual(before);
    for (const operation of prefix) expect(await db.table('outbox').get(operation.id)).toEqual(operation);
    db.close(); await db.open();
    const service = new BackupService(db), backup = await service.exportBackup(), plan = await service.preview(backup, 'replace'); await service.restore(plan, plan.recoveryText);
    expect(await db.table('transactions').count()).toBe(0); expect((await db.table('entityStates').toArray()).find(e => e.recordKey === 'trade').deleted).toBe(true);
    expect((await db.table('instruments').toArray())[0].id).toBe(named.entity.entityId); db.close(); await db.open();
});
it.each([1, 2])('migrates supported schema %s to native keys without changing financial values', async version => {
    const { legacySchema } = await import('@/app/database/foundation'); const fixture = (await import('../../test-fixtures/backup/portfolio-v2.json')).default;
    const old = version === 1 ? new Dexie(db.name) : legacyDatabase(db.name);
    if (version === 1) { old.version(1).stores(legacySchema); await old.open(); for (const store of ['accounts', 'stocks', 'transactions', 'stockPrices'] as const) await old.table(store).bulkAdd(fixture.records[store]); }
    else { await old.open(); const LegacyBackup = (await import('@/app/legacy/services/BackupService')).default; const service = new LegacyBackup(old), plan = await service.preview(JSON.stringify(fixture), 'replace'); await service.restore(plan, plan.recoveryText); }
    if (version === 2) {
        const names = old.tables.map(t => t.name), rows = await Promise.all(names.map(n => old.table(n).toArray())); old.close(); await old.delete();
        const raw = new Dexie(db.name); raw.version(2).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' }); await raw.open();
        for (let i = 0; i < names.length; i++) await raw.table(names[i]).bulkAdd(rows[i]); raw.close();
    } else old.close();
    await db.open(); const instruments = await db.table('instruments').toArray();
    for (const row of await db.table('transactions').toArray()) { const { instrumentId, ...body } = row; expect({ ...body, ticker: instruments.find(i => i.id === instrumentId).ticker }).toEqual(fixture.records.transactions.find(t => t.id === row.id)); }
    for (const row of await db.table('stockPrices').toArray()) { const { instrumentId, ...body } = row; expect({ ...body, ticker: instruments.find(i => i.id === instrumentId).ticker }).toEqual(fixture.records.stockPrices.find(t => t.id === row.id)); }
    db.close(); await db.open();
});
it.each(['numeric-v1', 'ordered-v1'])('refuses unknown variants of %s without modifying historical evidence', async variant => {
    const fixture = variant === 'numeric-v1' ? (await import('../../test-fixtures/database/numeric-v1.json')).default : (await import('../../test-fixtures/database/ordered-v1.json')).default;
    const raw = new Dexie(db.name); raw.version(1).stores({ ...fixture.stores, stocks: fixture.stores.stocks + ',unknownIndex' }); await raw.open();
    for (const [store, records] of Object.entries(fixture.records)) await raw.table(store).bulkAdd(records);
    const names = raw.tables.map(t => t.name), before = await Promise.all(names.map(n => raw.table(n).toArray())); raw.close();
    await expect(db.open()).rejects.toThrow('retained'); db.close(); const retained = new Dexie(db.name); await retained.open();
    try { expect(retained.verno).toBe(1); expect(await Promise.all(names.map(n => retained.table(n).toArray()))).toEqual(before); } finally { retained.close(); }
});
it('rejects newer local schema and old portable backup versions without reset', async () => {
    await db.open(); const service = new BackupService(db), before = await snapshot();
    for (const version of [1, 2, 3, 5]) { const backup = JSON.parse(await service.exportBackup()); backup.formatVersion = version; backup.databaseVersion = version; await expect(service.preview(JSON.stringify(backup), 'replace')).rejects.toThrow('Unsupported'); }
    expect(await snapshot()).toEqual(before); db.close();
    const newer = new Dexie(db.name); newer.version(5).stores({ future: 'id' }); await newer.open(); await newer.table('future').add({ id: 'evidence', value: 'keep' }); newer.close();
    await expect(db.open()).rejects.toThrow('newer'); db.close(); const retained = new Dexie(db.name); await retained.open();
    try { expect(retained.verno).toBe(5); expect(await retained.table('future').get('evidence')).toEqual({ id: 'evidence', value: 'keep' }); } finally { retained.close(); }
});
it('rolls back corrupt legacy UUID mapping rather than inventing a replacement', async () => {
    const old = legacyDatabase(db.name); await old.open(); const repo = new LegacyRepository(old); await repo.createInstrument({ ticker: 'SYNTH', name: 'Legacy' });
    const state = (await old.table('entityStates').toArray())[0]; await old.table('entityStates').put({ ...state, entityId: 'ambiguous' });
    const names = old.tables.map(t => t.name), before = await Promise.all(names.map(n => old.table(n).toArray())); old.close();
    await expect(db.open()).rejects.toThrow('integrity'); db.close(); const raw = new Dexie(db.name); await raw.open();
    try { expect(raw.verno).toBe(3); expect(await Promise.all(names.map(n => raw.table(n).toArray()))).toEqual(before); } finally { raw.close(); }
});
it.each([
    { currency: 'nok' }, { currency: 'NOKK' }, { instrumentKind: 'bond' }, { isin: 'not-an-isin' },
    { ticker: ' ' }, { exchange: ' ' }, { id: 'not-a-uuid' },
])('rejects invalid native instrument metadata without reserving an identity: %j', async invalid => {
    await db.open(); const before = await snapshot();
    await expect(new PortfolioRepository(db).createInstrument({ ...instrument, ...invalid } as any)).rejects.toThrow(); expect(await snapshot()).toEqual(before);
});
