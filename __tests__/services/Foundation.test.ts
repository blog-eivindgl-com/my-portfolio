/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { allStores, createPortfolioDatabase, legacySchema, readDomain } from '@/app/legacy/database/foundation';
import PortfolioRepository from '@/app/legacy/services/PortfolioRepository';
import BackupService from '@/app/legacy/services/BackupService';
import { parseBackup } from '@/app/legacy/services/backupFormat';
import { LocalState, Operation } from '@/app/legacy/database/types/foundation';
import fixture from '../../test-fixtures/backup/portfolio-v2.json';
import numeric from '../../test-fixtures/database/numeric-v1.json';
import ordered from '../../test-fixtures/database/ordered-v1.json';

let db: Dexie, repository: PortfolioRepository;
let n = 0;
beforeEach(async () => { jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-foundation-${++n}`); await db.open(); repository = new PortfolioRepository(db); });
afterEach(async () => { jest.restoreAllMocks(); await db.delete(); db.close(); });
const account = { id: 'account', name: 'Synthetic account' };
const stock = { ticker: 'SYNTH', name: 'Synthetic stock' };
async function snapshot() { return Promise.all(allStores.map(store => db.table(store).toArray())); }

it('creates a durable baseline without guessing currency or order, then commits a record and its operation together', async () => {
    await repository.createAccount(account);
    db.close(); await db.open();
    const operations: Operation[] = await db.table('outbox').toArray();
    expect(operations.map(row => row.sequence).sort()).toEqual([1, 2]);
    const entity = await db.table('entityStates').get(JSON.stringify(['accounts', account.id]));
    expect(entity).toMatchObject({ deleted: false, currency: null, tradeOrder: null, instrumentKind: null });
    expect(operations.find(row => row.kind === 'create')).toMatchObject({ id: entity.revision, entityId: entity.entityId, baseRevision: null });
    expect(await db.table('accounts').get(account.id)).toEqual(account);
});

it.each(['entityStates', 'outbox', 'localState'])('rolls back the domain record and sequence when %s persistence fails', async store => {
    const before = await snapshot();
    const method = store === 'localState' ? 'put' : 'add';
    jest.spyOn(db.table(store), method).mockRejectedValueOnce(new Error('Synthetic quota failure'));
    await expect(repository.createAccount(account)).rejects.toThrow('Synthetic quota failure');
    expect(await snapshot()).toEqual(before);
    jest.restoreAllMocks();
    await repository.createAccount(account);
    expect((await db.table('localState').get('local')).nextSequence).toBe(3);
});

it('serializes separate tab connections and retries one logical intent without duplicate operations', async () => {
    const other = createPortfolioDatabase(db.name);
    try {
        await other.open(); const second = new PortfolioRepository(other);
        await Promise.all([repository.createAccount(account), second.createAccount(account), second.createAccount({ id: 'other', name: 'Other synthetic' })]);
        await second.createAccount(account);
        expect(await db.table('accounts').count()).toBe(2);
        expect(await db.table('outbox').count()).toBe(3);
        const operations: Operation[] = await db.table('outbox').toArray();
        expect(operations.map(row => row.sequence).sort()).toEqual([1, 2, 3]);
        expect(new Set(operations.map(row => row.deviceId)).size).toBe(1);
    } finally { other.close(); }
});

it('records account/instrument/transaction creations while keeping trade order separate from queue order', async () => {
    await repository.createAccount(account); await repository.createInstrument(stock);
    await repository.createTransaction({ id: 'trade', accountId: account.id, ticker: stock.ticker, type: 0, date: Date.UTC(2020, 0, 1), shares: 0.125, price: 12.34, brokerage: 0, description: 'Synthetic' });
    expect(await db.table('outbox').count()).toBe(4);
    const operation = (await db.table('outbox').toArray()).find(row => row.kind === 'create' && row.payload.store === 'transactions');
    const accountEntity = await db.table('entityStates').get(JSON.stringify(['accounts', account.id]));
    const stockEntity = await db.table('entityStates').get(JSON.stringify(['stocks', stock.ticker]));
    expect(operation.payload.references).toEqual({ accountId: accountEntity.entityId, instrumentId: stockEntity.entityId });
    expect((await db.table('entityStates').toArray()).every(row => row.tradeOrder === null && row.currency === null)).toBe(true);
    const before = await snapshot();
    await expect(repository.createAccount({ ...account, name: 'Conflicting' })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
});

it('upgrades a populated supported v1 database atomically without changing domain fields or balances', async () => {
    await db.delete();
    const old = new Dexie(db.name); old.version(1).stores(legacySchema); await old.open();
    for (const store of ['accounts', 'stocks', 'transactions', 'stockPrices'] as const) await old.table(store).bulkAdd(fixture.records[store]);
    old.close(); await db.open();
    expect(await readDomain(db)).toEqual(await (async () => { const records = fixture.records; return { ...records,
        accounts: [...records.accounts].sort((a,b) => a.id.localeCompare(b.id)), stocks: [...records.stocks].sort((a,b) => a.ticker.localeCompare(b.ticker)),
        transactions: [...records.transactions].sort((a,b) => a.id.localeCompare(b.id)), stockPrices: [...records.stockPrices].sort((a,b) => a.id.localeCompare(b.id)) }; })());
    expect(await db.table('entityStates').count()).toBe(9);
    expect(await db.table('outbox').count()).toBe(1);
    const first = await snapshot(); db.close(); await db.open(); expect(await snapshot()).toEqual(first);
});

it('aborts an invalid/ambiguous v1 upgrade and retains the original data and schema for recovery', async () => {
    await db.delete();
    const old = new Dexie(db.name); old.version(1).stores(legacySchema); await old.open();
    await old.table('accounts').add({ ...account, historicalUnknown: 'retain-me' }); old.close();
    await expect(db.open()).rejects.toThrow(); db.close();
    const retained = new Dexie(db.name);
    try { await retained.open(); expect(retained.verno).toBe(1); expect(await retained.table('accounts').get(account.id)).toEqual({ ...account, historicalUnknown: 'retain-me' }); expect(retained.tables).toHaveLength(4); }
    finally { retained.close(); }
});

it('rolls back an interrupted migration and succeeds on retry', async () => {
    await db.delete();
    const old = new Dexie(db.name); old.version(1).stores(legacySchema); await old.open(); await old.table('accounts').add(account); old.close();
    db.table('outbox').hook('creating', () => { throw new Error('Synthetic interrupted upgrade'); });
    await expect(db.open()).rejects.toThrow(); db.close();
    const retry = createPortfolioDatabase(db.name);
    try { await retry.open(); expect(await retry.table('accounts').get(account.id)).toEqual(account); expect(await retry.table('entityStates').count()).toBe(1); expect(await retry.table('outbox').count()).toBe(1); }
    finally { retry.close(); }
});

it('restores stable identities into a new dataset with a local baseline, never a cloned device queue', async () => {
    const service = new BackupService(db);
    const before: LocalState = await db.table('localState').get('local');
    const plan = await service.preview(JSON.stringify(fixture), 'replace');
    await service.restore(plan, plan.recoveryText);
    const after: LocalState = await db.table('localState').get('local');
    expect(after.datasetId).not.toBe(before.datasetId); expect(after.datasetId).not.toBe(fixture.identity.datasetId);
    expect(after.deviceId).toBe(before.deviceId); expect(after.nextSequence).toBe(before.nextSequence + 1);
    expect(await db.table('outbox').count()).toBe(1);
    const restored = parseBackup(await service.exportBackup());
    expect(restored.identity.entities.map(row => row.entityId).sort()).toEqual(fixture.identity.entities.map(row => row.entityId).sort());
    expect(restored.identity.entities.every(row => row.revision === after.headRevision)).toBe(true);
    expect(JSON.stringify(restored)).not.toContain(after.deviceId);
});

it('rejects old backup format and newer database versions without mutations', async () => {
    const before = await snapshot();
    const service = new BackupService(db);
    await expect(service.preview(JSON.stringify({ ...fixture, formatVersion: 1, databaseVersion: 1 }), 'replace')).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    db.close();
    const newer = new Dexie(db.name); newer.version(4).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' }); await newer.open(); newer.close();
    await expect(db.open()).rejects.toThrow();
});

it.each([numeric, ordered])('retains an unsupported historical variant at $sourceRevision without remapping or dropping records', async fixture => {
    await db.delete();
    const old = new Dexie(db.name); old.version(1).stores(fixture.stores); await old.open();
    for (const [store, rows] of Object.entries(fixture.records)) await old.table(store).bulkAdd(rows);
    const before = await Promise.all([...old.tables].sort((a,b) => a.name.localeCompare(b.name)).map(async table => ({ name: table.name, rows: await table.toArray() })));
    old.close();
    await expect(db.open()).rejects.toThrow(); db.close();
    const retained = new Dexie(db.name);
    try {
        await retained.open(); expect(retained.verno).toBe(1);
        expect(await Promise.all([...retained.tables].sort((a,b) => a.name.localeCompare(b.name)).map(async table => ({ name: table.name, rows: await table.toArray() })))).toEqual(before);
    } finally { retained.close(); }
});

it('refuses an unknown v1 store before Dexie can remove it', async () => {
    await db.delete();
    const old = new Dexie(db.name); old.version(1).stores({ ...legacySchema, unrelated: 'id' }); await old.open();
    await old.table('unrelated').add({ id: 'preserve', value: 'synthetic-only' }); old.close();
    await expect(db.open()).rejects.toThrow('Unsupported historical store');
    const retained = new Dexie(db.name);
    try { await retained.open(); expect(retained.verno).toBe(1); expect(await retained.table('unrelated').get('preserve')).toEqual({ id: 'preserve', value: 'synthetic-only' }); }
    finally { retained.close(); }
});

it('restore failure rolls back all seven stores and retains the original dataset and queue', async () => {
    await repository.createAccount(account);
    const service = new BackupService(db), before = await snapshot();
    const plan = await service.preview(JSON.stringify(fixture), 'replace');
    jest.spyOn(db.table('outbox'), 'add').mockRejectedValueOnce(new Error('Synthetic baseline failure'));
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    await service.restore(plan, plan.recoveryText);
    expect(await db.table('outbox').count()).toBe(1);
});

it('rejects a preview if metadata changes even when domain records match', async () => {
    await repository.createAccount(account);
    const service = new BackupService(db), plan = await service.preview(JSON.stringify(fixture), 'replace');
    const entity = (await db.table('entityStates').toArray())[0];
    await db.table('entityStates').update(entity.key, { revision: crypto.randomUUID() });
    const before = await snapshot();
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow('changed after preview');
    expect(await snapshot()).toEqual(before);
});

it.each(['missing', 'duplicate', 'currency', 'revision', 'extra'])('rejects invalid portable identity metadata: %s', async condition => {
    const altered = structuredClone(fixture);
    if (condition === 'missing') altered.identity.entities.pop();
    if (condition === 'duplicate') altered.identity.entities[1].entityId = altered.identity.entities[0].entityId;
    if (condition === 'currency') Object.assign(altered.identity.entities[0], { currency: 'NOK' });
    if (condition === 'revision') altered.identity.entities[0].revision = 'invalid';
    if (condition === 'extra') Object.assign(altered.identity, { deviceId: 'unsupported' });
    const before = await snapshot();
    await expect(new BackupService(db).preview(JSON.stringify(altered), 'replace')).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
});

it('refuses a corrupt sequence without committing or silently restarting allocation', async () => {
    await db.table('localState').update('local', { nextSequence: 0 });
    const before = await snapshot();
    await expect(repository.createAccount(account)).rejects.toThrow('device sequence');
    expect(await snapshot()).toEqual(before);
    const service = new BackupService(db), plan = await service.preview(JSON.stringify(fixture), 'replace');
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow('device sequence');
    expect(await snapshot()).toEqual(before);
});

it('refuses an unrecognized native schema version without touching its records', async () => {
    await db.delete();
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(db.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('evidence', { keyPath: 'id' }).add({ id: 'retain' });
        request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    });
    await expect(db.open()).rejects.toThrow('Unsupported historical schema');
    const retained = new Dexie(db.name);
    try { await retained.open(); expect(retained.verno).toBe(0.1); expect(await retained.table('evidence').get('retain')).toEqual({ id: 'retain' }); }
    finally { retained.close(); }
});
