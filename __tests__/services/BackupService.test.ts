/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createPortfolioDatabase, baseline, allStores } from '@/app/database/foundation';
import BackupService from '@/app/services/BackupService';
import { canonicalRecords, createBackup as rawCreateBackup, makeIdentity, parseBackup, PortfolioRecords, serializeBackup, storeNames, validateBackup } from '@/app/services/backupFormat';
import TransactionService from '@/app/services/TransactionService';
import PriceListService from '@/app/services/PriceListService';
import DbService from '@/app/services/DbService';
import fixture from '../../test-fixtures/backup/portfolio-v4.json';

const input = JSON.stringify(fixture);
function createBackup(value: unknown) {
    const backup = rawCreateBackup(value);
    backup.identity.entities = backup.identity.entities.map(entity => ({ ...entity, entityId: fixture.identity.entities.find(row => row.key === entity.key)?.entityId || entity.entityId }));
    return backup;
}
const empty = () => ({ accounts: [], instruments: [], transactions: [], stockPrices: [] });
let db: Dexie;
let service: BackupService;
let counter = 0;
beforeEach(async () => {
    jest.useRealTimers();
    db = createPortfolioDatabase(`synthetic-backup-tests-${++counter}`);
    await db.open();
    service = new BackupService(db);
});
afterEach(async () => { await db.delete(); db.close(); jest.restoreAllMocks(); });

async function seed(records: PortfolioRecords = parseBackup(input).records) {
    await db.transaction('rw', allStores, async () => {
        for (const store of storeNames) await db.table(store).bulkAdd(records[store]);
        await baseline(db, records, parseBackup(input).identity.entities);
    });
}
async function current() { return parseBackup(await service.exportBackup()).records; }

it('roundtrips all exact IDs, references, timestamps, descriptions and fractional values into a fresh database', async () => {
    const before = parseBackup(input).records;
    const plan = await service.preview(input, 'replace');
    expect(plan.current).toEqual({ accounts: 0, instruments: 0, transactions: 0, stockPrices: 0 });
    await service.restore(plan, plan.recoveryText);
    db.close(); await db.open();
    expect(canonicalRecords(await current())).toBe(canonicalRecords(before));
    const calculations = (records: PortfolioRecords) => {
        const financial = new TransactionService(new PriceListService(new DbService()));
        return [...records.instruments].sort((a,b) => a.id.localeCompare(b.id)).map(stock => {
            const prices = Object.assign({ instrumentId: stock.id }, ...records.stockPrices.filter(row => row.instrumentId === stock.id).map(row => ({ [row.date]: row.price })));
            return financial.getTransactionListViewModel(records.transactions.filter(row => row.instrumentId === stock.id), prices);
        });
    };
    expect(calculations(await current())).toEqual(calculations(before));
});

it('exports only the documented envelope and rejects unexpected fields instead of leaking credentials', async () => {
    await seed();
    expect(Object.keys(JSON.parse(await service.exportBackup()))).toEqual(['format', 'formatVersion', 'databaseVersion', 'exportedAt', 'records', 'identity']);
    await db.table('accounts').update('synthetic-account-a', { accessToken: 'SYNTHETIC-NOT-A-TOKEN' });
    await expect(service.exportBackup()).rejects.toThrow('unsupported fields');
});

it.each([
    ['malformed JSON', '{'],
    ['newer format', JSON.stringify({ ...fixture, formatVersion: 99 })],
    ['newer database', JSON.stringify({ ...fixture, databaseVersion: 99 })],
    ['wrong marker', JSON.stringify({ ...fixture, format: 'another-app' })],
    ['extra envelope fields', JSON.stringify({ ...fixture, token: 'SYNTHETIC' })],
    ['invalid export date', JSON.stringify({ ...fixture, exportedAt: 'tomorrow' })],
    ['missing collection', JSON.stringify({ ...fixture, records: { accounts: [] } })],
    ['duplicate IDs', JSON.stringify({ ...fixture, records: { ...fixture.records, accounts: [...fixture.records.accounts, fixture.records.accounts[0]] } })],
    ['missing reference', JSON.stringify({ ...fixture, records: { ...fixture.records, accounts: [] } })],
    ['wrong type', JSON.stringify({ ...fixture, records: { ...fixture.records, transactions: [{ ...fixture.records.transactions[0], shares: '10' }] } })],
    ['invalid trade date', JSON.stringify({ ...fixture, records: { ...fixture.records, transactions: [{ ...fixture.records.transactions[0], date: 1 }] } })],
    ['unknown transaction fields', JSON.stringify({ ...fixture, records: { ...fixture.records, transactions: [{ ...fixture.records.transactions[0], order: 1 }] } })],
    ['numeric historical identities', JSON.stringify({ ...fixture, records: { ...fixture.records, accounts: [{ id: 1, name: 'Synthetic' }] } })],
    ['missing quote instrument', JSON.stringify({ ...fixture, records: { ...fixture.records, stockPrices: [{ ...fixture.records.stockPrices[0], instrumentId: 'ffa63583-dfa6-406b-87d2-84b86b0d693a' }] } })],
    ['negative price', JSON.stringify({ ...fixture, records: { ...fixture.records, stockPrices: [{ ...fixture.records.stockPrices[0], price: -1 }] } })],
])('rejects %s before any destructive write', async (_name, text) => {
    await seed(); const before = await current();
    await expect(service.preview(text, 'replace')).rejects.toThrow();
    expect(await current()).toEqual(before);
});

it.each([NaN, Infinity, -Infinity])('rejects nonfinite runtime values %s', price => {
    expect(() => validateBackup({ ...fixture, records: { ...fixture.records, stockPrices: [{ ...fixture.records.stockPrices[0], price }] } })).toThrow();
});

it('rejects negative zero in validated backups instead of silently normalizing its value', () => {
    expect(() => validateBackup({ ...fixture, records: { ...fixture.records, transactions: [{ ...fixture.records.transactions[0], brokerage: -0 }] } })).toThrow('negative zero');
});

it('rejects excessive file and record sizes before writing', async () => {
    await expect(service.preview(' '.repeat(10 * 1024 * 1024 + 1), 'replace')).rejects.toThrow('10 MiB');
    expect(() => createBackup({ ...empty(), accounts: Array(100_001).fill({ id: 'a', name: 'Synthetic' }) })).toThrow('100000');
});

it('rejects historical auto-increment identity layouts even when empty', async () => {
    await db.delete();
    const legacy = new Dexie('synthetic-backup-legacy');
    legacy.version(1).stores({ accounts: '++id', instruments: 'instrumentId', transactions: '++id', stockPrices: 'id' });
    try { await expect(new BackupService(legacy).exportBackup()).rejects.toThrow('historical'); }
    finally { await legacy.delete(); legacy.close(); }
});

it('previews without writing and safely merges additions and skips identical records', async () => {
    await seed(); const before = await current();
    const incoming = createBackup({ ...before, accounts: [...before.accounts, { id: 'new-account', name: 'Synthetic new account' }] });
    const plan = await service.preview(serializeBackup(incoming), 'merge');
    expect(await current()).toEqual(before);
    expect(plan.identical).toBe(9);
    expect(plan.conflicts).toEqual([]);
    await service.restore(plan, plan.recoveryText);
    expect((await current()).accounts).toHaveLength(3);
    const again = await service.preview(serializeBackup(incoming), 'merge');
    await service.restore(again, again.recoveryText);
    expect((await current()).accounts).toHaveLength(3);
});

it('reports conflicting IDs and blocks merge without overwriting', async () => {
    await seed(); const before = await current();
    const incoming = createBackup({ ...before, accounts: before.accounts.map(row => ({ ...row, name: 'Different synthetic name' })) });
    const plan = await service.preview(serializeBackup(incoming), 'merge');
    expect(plan.conflicts).toHaveLength(2);
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow('conflicting');
    expect(await current()).toEqual(before);
});

it('replaces only after a matching recovery copy, which can restore the original dataset independently', async () => {
    await seed(); const before = await current();
    const plan = await service.preview(serializeBackup(createBackup(empty())), 'replace');
    await expect(service.restore(plan, serializeBackup(createBackup(empty())))).rejects.toThrow('recovery copy');
    expect(await current()).toEqual(before);
    await service.restore(plan, plan.recoveryText);
    expect(await current()).toEqual(empty());
    const recovery = await service.preview(plan.recoveryText, 'replace');
    await service.restore(recovery, recovery.recoveryText);
    expect(canonicalRecords(await current())).toBe(canonicalRecords(before));
});

it('rejects stale previews when another tab changes data', async () => {
    const plan = await service.preview(input, 'replace');
    await db.table('accounts').add({ id: 'concurrent', name: 'Synthetic concurrent' });
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow('changed after preview');
    expect(await db.table('accounts').toArray()).toEqual([{ id: 'concurrent', name: 'Synthetic concurrent' }]);
});

it('revalidates tampered input at the service write boundary', async () => {
    const plan = await service.preview(input, 'replace');
    plan.incomingText = '{}';
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow();
    expect(await current()).toEqual(empty());
});

it.each(['quota failure', 'transaction abort'])('rolls back all cleared/partially written stores after %s, then permits retry', async reason => {
    await seed(); const before = await current();
    const different = createBackup({ ...before, accounts: [...before.accounts, { id: 'new', name: 'Synthetic new' }] });
    const plan = await service.preview(serializeBackup(different), 'replace');
    jest.spyOn(db.table('stockPrices'), 'bulkAdd').mockImplementationOnce(() => {
        if (reason === 'transaction abort') Dexie.currentTransaction?.abort();
        throw new Error(`Synthetic ${reason}`);
    });
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow();
    expect(await current()).toEqual(before);
    await service.restore(plan, plan.recoveryText);
    expect((await current()).accounts).toHaveLength(3);
});

it('serializes simultaneous restore attempts without duplicate records', async () => {
    const plan = await service.preview(input, 'merge');
    const results = await Promise.allSettled([service.restore(plan, plan.recoveryText), service.restore(plan, plan.recoveryText)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(canonicalRecords(await current())).toBe(canonicalRecords(parseBackup(input).records));
});

it('preserves malformed scalar values losslessly in a separate archive that validated restore rejects', async () => {
    await seed();
    await db.table('transactions').put({
        ...await db.table('transactions').get('synthetic-buy-a'),
        shares: NaN, brokerage: -0, order: 3, timestamp: undefined, date: new Date('2024-01-02T12:00:00Z'),
    });
    await expect(service.exportBackup()).rejects.toThrow();
    const content = await service.exportRecoveryArchive();
    const archive = JSON.parse(content);
    expect(archive.format).toBe('my-portfolio-recovery-only');
    expect(archive.directlyImportable).toBe(false);
    const row = archive.stores.transactions.entries.find((entry: { key: { value: string } }) => entry.key.value === 'synthetic-buy-a');
    expect(Object.fromEntries(row.fields)).toMatchObject({
        shares: { type: 'number', value: 'NaN' }, brokerage: { type: 'number', value: '-0' },
        order: { type: 'number', value: '3' }, timestamp: { type: 'undefined' },
        date: { type: 'date', value: String(Date.parse('2024-01-02T12:00:00Z')) },
    });
    await expect(service.preview(content, 'replace')).rejects.toThrow('not a directly importable');
    expect(Number.isNaN((await db.table('transactions').get('synthetic-buy-a')).shares)).toBe(true);
});

it('archives the actual old three-store layout and numeric primary keys without creating the missing price store', async () => {
    const legacy = new Dexie('synthetic-raw-recovery-legacy');
    legacy.version(1).stores({ accounts: '++id,name', stocks: 'ticker,name', transactions: '++id,accountId' });
    try {
        await legacy.open();
        await legacy.table('accounts').add({ id: 7, name: 'Synthetic legacy' });
        const archive = JSON.parse(await new BackupService(legacy).exportRecoveryArchive());
        expect(Object.keys(archive.stores).sort()).toEqual(['accounts', 'stocks', 'transactions']);
        expect(archive.stores.accounts.autoIncrement).toBe(true);
        expect(archive.stores.accounts.entries[0].key).toEqual({ type: 'number', value: '7' });
        expect(legacy.tables).toHaveLength(3);
    } finally { await legacy.delete(); legacy.close(); }
});

it('refuses unknown fields or nested values in recovery-only export instead of leaking or dropping them', async () => {
    await seed();
    await db.table('accounts').update('synthetic-account-a', { token: 'SYNTHETIC-ONLY' });
    await expect(service.exportRecoveryArchive()).rejects.toThrow('Unsupported record fields');
    await db.table('accounts').put({ id: 'synthetic-account-a', name: { nested: 'unsupported' } });
    await expect(service.exportRecoveryArchive()).rejects.toThrow('nested/binary');
});
