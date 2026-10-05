/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { allStores, createPortfolioDatabase } from '@/app/database/foundation';
import { NameStore, NameTarget } from '@/app/database/types/foundation';
import PortfolioRepository from '@/app/services/PortfolioRepository';
import BackupService from '@/app/services/BackupService';
import { parseBackup } from '@/app/services/backupFormat';

let db: Dexie, repo: PortfolioRepository, n = 0;
const trade = { id: 'trade', accountId: 'SYNTH', ticker: 'SYNTH', type: 0, date: Date.UTC(2024, 0, 1), description: 'Synthetic only', shares: 0.123, price: 12.34, brokerage: 0.25 };
const snapshot = () => Promise.all(allStores.map(store => db.table(store).toArray()));
const rename = (repository: PortfolioRepository, store: NameStore, target: NameTarget, name: unknown) => store === 'accounts' ? repository.renameAccount(target, name) : repository.renameInstrument(target, name);
async function target(store: NameStore, repository = repo): Promise<NameTarget> {
    const row = await repository.getNamedEntity(store, 'SYNTH');
    return { commandId: crypto.randomUUID(), datasetId: row.datasetId, entityId: row.entity.entityId, recordKey: 'SYNTH', expectedRevision: row.entity.revision };
}
beforeEach(async () => {
    jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-name-corrections-${++n}`); await db.open(); repo = new PortfolioRepository(db);
    await repo.createAccount({ id: 'SYNTH', name: 'Synthetic account' }); await repo.createInstrument({ ticker: 'SYNTH', name: 'Synthetic instrument' }); await repo.createTransaction(trade);
});
afterEach(async () => { jest.restoreAllMocks(); await db.delete(); db.close(); });

describe.each(['accounts', 'stocks'] as const)('%s name corrections', store => {
    it('preserves identity, references, values and old operations while recording exact before/after across restart', async () => {
        const before = await repo.getNamedEntity(store, 'SYNTH'), command = await target(store), oldOperations = await db.table('outbox').toArray();
        const entity = await rename(repo, store, command, '  Renamed Å & Fund  ');
        db.close(); await db.open();
        expect((await repo.getNamedEntity(store, 'SYNTH')).record).toEqual({ ...before.record, name: '  Renamed Å & Fund  ' });
        expect(entity).toEqual({ ...before.entity, revision: command.commandId });
        expect(await db.table('transactions').get('trade')).toEqual(trade);
        expect(await db.table('outbox').get(command.commandId)).toMatchObject({ operationVersion: 3, kind: 'rename', baseRevision: command.expectedRevision, sequence: 5,
            payload: { before: before.record, after: { ...before.record, name: '  Renamed Å & Fund  ' }, entity, command: { ...command, kind: 'rename', store, name: '  Renamed Å & Fund  ' } } });
        for (const operation of oldOperations) expect(await db.table('outbox').get(operation.id)).toEqual(operation);
    });

    it('deduplicates concurrent commands and old retries after a later rename and restart', async () => {
        const otherDb = createPortfolioDatabase(db.name); await otherDb.open(); const other = new PortfolioRepository(otherDb), command = await target(store);
        try {
            const [one, two] = await Promise.all([rename(repo, store, command, 'First name'), rename(other, store, command, 'First name')]); expect(one).toEqual(two);
            expect(await db.table('outbox').count()).toBe(5);
            await rename(repo, store, await target(store), 'Latest name'); otherDb.close(); db.close(); await db.open();
            const before = await snapshot(); await rename(repo, store, command, 'First name'); expect(await snapshot()).toEqual(before);
            expect((await repo.getNamedEntity(store, 'SYNTH')).record.name).toBe('Latest name');
        } finally { otherDb.close(); }
    });

    it('allows only one competing rename from the same base revision', async () => {
        const otherDb = createPortfolioDatabase(db.name); await otherDb.open(); const other = new PortfolioRepository(otherDb), command = await target(store);
        try {
            const results = await Promise.allSettled([rename(repo, store, command, 'One'), rename(other, store, { ...command, commandId: crypto.randomUUID() }, 'Two')]);
            expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
            expect((results.find(row => row.status === 'rejected') as PromiseRejectedResult).reason.name).toBe('NameConflictError');
            expect(await db.table('outbox').count()).toBe(5); expect((await db.table('localState').get('local')).nextSequence).toBe(6);
        } finally { otherDb.close(); }
    });

    it.each(['record', 'entityStates', 'outbox', 'localState'])('rolls back all stores if %s fails and retries once', async failure => {
        const command = await target(store), before = await snapshot();
        jest.spyOn(db.table(failure === 'record' ? store : failure), failure === 'outbox' ? 'add' : 'put').mockRejectedValueOnce(new Error('Synthetic quota failure'));
        await expect(rename(repo, store, command, 'Retried name')).rejects.toThrow('Synthetic quota failure'); expect(await snapshot()).toEqual(before);
        jest.restoreAllMocks(); await rename(repo, store, command, 'Retried name'); await rename(repo, store, command, 'Retried name');
        expect(await db.table('outbox').count()).toBe(5);
    });

    it('rejects invalid names, identities, reassignment-shaped input and command reuse without mutations', async () => {
        const command = await target(store), before = await snapshot();
        for (const value of ['', ' \t ', null, undefined, 17, { name: 'New', id: 'different', ticker: 'different' }]) await expect(rename(repo, store, command, value)).rejects.toThrow('nonempty name');
        await expect(rename(repo, store, { ...command, commandId: 'invalid' }, 'Valid name')).rejects.toThrow('command identity');
        await expect(rename(repo, store, { ...command, entityId: crypto.randomUUID() }, 'Valid name')).rejects.toThrow('changed in another tab');
        expect(await snapshot()).toEqual(before);
        await rename(repo, store, command, 'Valid name'); const saved = await snapshot();
        await expect(rename(repo, store, command, 'Different intent')).rejects.toThrow('command ID'); expect(await snapshot()).toEqual(saved);
    });

    it('fails closed on missing or inconsistent identity/record evidence without allocating replacement IDs', async () => {
        const command = await target(store), key = JSON.stringify([store, 'SYNTH']);
        await db.table('entityStates').update(key, { recordKey: 'mismatched' }); let before = await snapshot();
        await expect(rename(repo, store, command, 'Do not save')).rejects.toThrow('Inconsistent'); expect(await snapshot()).toEqual(before);
        await db.table('entityStates').update(key, { recordKey: 'SYNTH' }); await db.table(store).update('SYNTH', { extraHistoricalField: 'retain' }); before = await snapshot();
        await expect(rename(repo, store, command, 'Do not save')).rejects.toThrow('Inconsistent'); expect(await snapshot()).toEqual(before);
        await db.table('entityStates').delete(key); before = await snapshot();
        await expect(rename(repo, store, command, 'Do not save')).rejects.toThrow('unavailable'); expect(await snapshot()).toEqual(before);
    });

    it('retains distinct identities with duplicate names and blocks a corrupt sequence', async () => {
        if (store === 'accounts') await repo.createAccount({ id: 'other', name: 'Same name' }); else await repo.createInstrument({ ticker: 'OTHER', name: 'Same name' });
        await rename(repo, store, await target(store), 'Same name'); expect(await db.table(store).count()).toBe(2);
        await db.table('localState').update('local', { nextSequence: 0 }); const before = await snapshot();
        await expect(rename(repo, store, await target(store), 'No write')).rejects.toThrow('device sequence'); expect(await snapshot()).toEqual(before);
    });

    it('round-trips names and references, blocks old-name merge, invalidates stale previews and pre-restore commands', async () => {
        const service = new BackupService(db), old = await service.exportBackup(), stalePlan = await service.preview(old, 'replace'), command = await target(store);
        await rename(repo, store, command, 'Renamed');
        await expect(service.restore(stalePlan, stalePlan.recoveryText)).rejects.toThrow('changed after preview');
        const corrected = await service.exportBackup(), incoming = parseBackup(corrected);
        expect(incoming.formatVersion).toBe(3); expect(incoming.records[store][0].name).toBe('Renamed');
        const merge = await service.preview(old, 'merge'), before = await snapshot(); expect(merge.conflicts.length).toBeGreaterThan(0);
        await expect(service.restore(merge, merge.recoveryText)).rejects.toThrow('conflicting'); expect(await snapshot()).toEqual(before);
        const fresh = createPortfolioDatabase(`${db.name}-restore`);
        try {
            await fresh.open(); const restore = new BackupService(fresh), plan = await restore.preview(corrected, 'replace'); await restore.restore(plan, plan.recoveryText);
            expect((await new PortfolioRepository(fresh).getNamedEntity(store, 'SYNTH')).record.name).toBe('Renamed'); expect(await fresh.table('transactions').get('trade')).toEqual(trade);
            expect((await new PortfolioRepository(fresh).getNamedEntity(store, 'SYNTH')).entity.entityId).toBe(command.entityId);
        } finally { await fresh.delete(); fresh.close(); }
        const plan = await service.preview(old, 'replace'); await service.restore(plan, plan.recoveryText);
        await expect(rename(repo, store, command, 'Renamed')).rejects.toThrow('restored or replaced');
        expect(await db.table('transactions').get('trade')).toEqual(trade);
    });
});

it('allocates shared sequences for account/instrument renames and a trade correction without changing references', async () => {
    const account = await target('accounts'), instrument = await target('stocks'), transaction = await repo.getTransaction('trade');
    await Promise.all([repo.renameAccount(account, 'New account'), repo.renameInstrument(instrument, 'New instrument'), repo.updateTransaction({ commandId: crypto.randomUUID(), datasetId: transaction.datasetId,
        entityId: transaction.entity.entityId, transactionId: 'trade', expectedRevision: transaction.entity.revision }, { ...trade, description: 'Corrected' })]);
    const operations = await db.table('outbox').toArray(); expect(operations.map(row => row.sequence).sort()).toEqual([1,2,3,4,5,6,7]);
    expect(await db.table('transactions').get('trade')).toEqual({ ...trade, description: 'Corrected' });
    expect((await repo.getNamedEntity('accounts', 'SYNTH')).entity.entityId).toBe(account.entityId);
    expect((await repo.getNamedEntity('stocks', 'SYNTH')).entity.entityId).toBe(instrument.entityId);
});

it('shares command-ID uniqueness across stores and rejects non-name stores at the read boundary', async () => {
    const account = await target('accounts'), stock = await target('stocks'); await repo.renameAccount(account, 'Account changed');
    const before = await snapshot(); await expect(repo.renameInstrument({ ...stock, commandId: account.commandId }, 'Instrument changed')).rejects.toThrow('command ID');
    await expect(repo.getNamedEntity('transactions' as NameStore, 'trade')).rejects.toThrow('Invalid account or instrument'); expect(await snapshot()).toEqual(before);
});
