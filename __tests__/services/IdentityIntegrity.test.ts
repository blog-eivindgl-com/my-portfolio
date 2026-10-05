/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { allStores, createPortfolioDatabase, legacySchema } from '@/app/database/foundation';
import { inspectIdentityIntegrity, verifyIdentitySnapshot } from '@/app/database/identityIntegrity';
import PortfolioRepository from '@/app/services/PortfolioRepository';
import BackupService from '@/app/services/BackupService';
import { parseBackup } from '@/app/services/backupFormat';
import fixture from '../../test-fixtures/backup/portfolio-v2.json';

let db: Dexie, repo: PortfolioRepository;
let serial = 0;
beforeEach(async () => { jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-integrity-${++serial}`); await db.open(); repo = new PortfolioRepository(db); });
afterEach(async () => { jest.restoreAllMocks(); db.close(); await db.delete(); });
const account = { id: 'a', name: ' Account ' }, stock = { ticker: 'S', name: 'Stock' };
const trade = { id: 't', accountId: 'a', ticker: 'S', type: 0, date: Date.UTC(2020, 0, 1), shares: 0.125, price: 1.23, brokerage: 0, description: ' preserve ', tradeTime: '00:00' };
async function seed() { await repo.createAccount(account); await repo.createInstrument(stock); await repo.createTransaction(trade); }
async function input(source = db) {
    const rows = await Promise.all(allStores.map(store => source.table(store).toArray()));
    return { records: { accounts: rows[0], stocks: rows[1], transactions: rows[2], stockPrices: rows[3] }, entities: rows[5], localState: rows[4], operations: rows[6] };
}
async function check() { return db.transaction('r', allStores, () => inspectIdentityIntegrity(db)); }
async function namedTarget() { const s = await repo.getNamedEntity('stocks', 'S'); return { commandId: crypto.randomUUID(), datasetId: s.datasetId, entityId: s.entity.entityId, recordKey: 'S', expectedRevision: s.entity.revision }; }
async function tradeTarget() { const s = await repo.getTransaction('t'); return { commandId: crypto.randomUUID(), datasetId: s.datasetId, entityId: s.entity.entityId, transactionId: 't', expectedRevision: s.entity.revision }; }

it('verifies create, rename, update, delete and old receipts across restart without changing any store', async () => {
    await seed(); const rename = await namedTarget(); await repo.renameInstrument(rename, ' Renamed æ ');
    const update = await tradeTarget(); await repo.updateTransaction(update, { ...trade, price: 2.34 });
    await repo.deleteTransaction(await tradeTarget());
    const before = await input();
    expect(await check()).toMatchObject({ operationCount: 7, liveRecords: 2, tombstones: 1, instruments: [{ legacyTicker: 'S', transactions: 0, prices: 0 }] });
    db.close(); await db.open();
    await repo.renameInstrument(rename, ' Renamed æ '); await repo.updateTransaction(update, { ...trade, price: 2.34 });
    expect(await input()).toEqual(before);
});

it('accepts restored baselines starting at a later device sequence and portable tombstone round trips', async () => {
    await seed(); await repo.deleteTransaction(await tradeTarget());
    const service = new BackupService(db), exported = await service.exportBackup();
    const plan = await service.preview(JSON.stringify(fixture), 'replace'); await service.restore(plan, plan.recoveryText);
    const restore = await service.preview(exported, 'replace'); await service.restore(restore, restore.recoveryText);
    expect((await input()).operations[0].sequence).toBeGreaterThan(1);
    expect(await check()).toMatchObject({ operationCount: 1, tombstones: 1 });
    const before = await input(); db.close(); await db.open(); expect(await input()).toEqual(before);
    expect(parseBackup(await service.exportBackup()).identity.entities.map(e => e.entityId).sort()).toEqual(parseBackup(exported).identity.entities.map(e => e.entityId).sort());
});

it.each(['missing operation', 'gap', 'head', 'device', 'version', 'reference', 'record', 'revision', 'unknown field', 'case collision', 'duplicate operation'])('refuses inconsistent evidence without repairing it: %s', async condition => {
    await seed(); const value = await input(), last = value.operations.find(op => op.kind === 'create' && op.payload.store === 'transactions');
    if (condition === 'missing operation') value.operations.splice(value.operations.indexOf(last), 1);
    if (condition === 'gap') last.sequence += 1;
    if (condition === 'head') value.localState[0].headRevision = crypto.randomUUID();
    if (condition === 'device') last.deviceId = crypto.randomUUID();
    if (condition === 'version') last.operationVersion = 99;
    if (condition === 'reference') last.payload.references.instrumentId = crypto.randomUUID();
    if (condition === 'record') value.records.transactions[0].price += 1;
    if (condition === 'revision') value.entities[0].revision = crypto.randomUUID();
    if (condition === 'unknown field') last.extra = 'retain';
    if (condition === 'case collision') { value.entities[0].entityId = 'abcdef00-0000-4000-8000-000000000001'; value.entities[1].entityId = value.entities[0].entityId.toUpperCase(); }
    if (condition === 'duplicate operation') value.operations.push(structuredClone(last));
    const before = structuredClone(value);
    expect(() => verifyIdentitySnapshot(value)).toThrow('Records were retained'); expect(value).toEqual(before);
});

it.each(['before', 'command', 'entity', 'after', 'base'])('checks rename history even when current records look valid: %s', async field => {
    await seed(); await repo.renameInstrument(await namedTarget(), 'Renamed');
    const value = await input(), op = value.operations.find(row => row.kind === 'rename');
    if (field === 'before') op.payload.before.name = 'Invented';
    if (field === 'command') op.payload.command.name = 'Invented';
    if (field === 'entity') op.payload.entity.currency = 'NOK';
    if (field === 'after') op.payload.after.ticker = 'OTHER';
    if (field === 'base') op.baseRevision = crypto.randomUUID();
    expect(() => verifyIdentitySnapshot(value)).toThrow('integrity');
});

it('blocks explicit reopen and auto-opened writes on corrupt history, retaining native evidence', async () => {
    await seed(); await db.table('outbox').delete((await db.table('localState').get('local')).headRevision);
    const before = await input(); db.close();
    await expect(db.open()).rejects.toThrow('integrity'); db.close();
    const auto = createPortfolioDatabase(db.name);
    try { await expect(new PortfolioRepository(auto).createAccount({ id: 'blocked', name: 'Blocked' })).rejects.toThrow(); } finally { auto.close(); }
    const raw = new Dexie(db.name); await raw.open();
    try { expect(await input(raw)).toEqual(before); expect(raw.verno).toBe(3); } finally { raw.close(); }
});

it('rolls back a v2 upgrade on failed history verification and allows a valid retry after synthetic repair', async () => {
    await seed(); const saved = await input(); await db.delete();
    const old = new Dexie(db.name); old.version(2).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' }); await old.open();
    for (const store of ['accounts', 'stocks', 'transactions', 'stockPrices'] as const) await old.table(store).bulkAdd(saved.records[store]);
    await old.table('entityStates').bulkAdd(saved.entities); await old.table('localState').bulkAdd(saved.localState);
    await old.table('outbox').bulkAdd(saved.operations.slice(1)); const before = await input(old); old.close();
    await expect(db.open()).rejects.toThrow('integrity'); db.close();
    const raw = new Dexie(db.name); await raw.open();
    expect(raw.verno).toBe(2); expect(await input(raw)).toEqual(before);
    await raw.table('outbox').clear(); await raw.table('outbox').bulkAdd(saved.operations); raw.close();
    await db.open(); expect(db.verno).toBe(3); expect(await input()).toEqual(saved);
});

it('takes consistent snapshots while separate connections race mutations and same-command retries', async () => {
    await seed(); const other = createPortfolioDatabase(db.name); await other.open();
    try {
        const target = await namedTarget(), second = new PortfolioRepository(other);
        await Promise.all([repo.renameInstrument(target, 'Concurrent'), second.renameInstrument(target, 'Concurrent'), check(), other.transaction('r', allStores, () => inspectIdentityIntegrity(other))]);
        expect(await check()).toMatchObject({ operationCount: 5 });
        db.close(); await db.open(); expect(await check()).toMatchObject({ operationCount: 5 });
    } finally { other.close(); }
});

it('rejects case-aliased portable UUID collisions before restore can write a new baseline', async () => {
    const file = structuredClone(fixture); file.identity.entities[0].entityId = 'abcdef00-0000-4000-8000-000000000001'; file.identity.entities[1].entityId = file.identity.entities[0].entityId.toUpperCase();
    const before = await input(); await expect(new BackupService(db).preview(JSON.stringify(file), 'replace')).rejects.toThrow('identity'); expect(await input()).toEqual(before);
});

it.each(['undefined field', 'NaN metadata', 'negative zero'])('does not erase native history corruption through JSON comparison: %s', async condition => {
    await seed(); const value = await input(), op = value.operations.find(row => row.kind === 'create' && row.payload.store === 'transactions');
    if (condition === 'undefined field') op.payload.entity.extra = undefined;
    if (condition === 'NaN metadata') op.payload.entity.currency = NaN;
    if (condition === 'negative zero') {
        await repo.updateTransaction(await tradeTarget(), { ...trade, price: 2 });
        const changed = await input(), update = changed.operations.find(row => row.kind === 'update');
        update.payload.before.brokerage = -0;
        expect(() => verifyIdentitySnapshot(changed)).toThrow('integrity'); return;
    }
    expect(() => verifyIdentitySnapshot(value)).toThrow('integrity');
});
