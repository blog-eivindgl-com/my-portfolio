/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { allStores, createPortfolioDatabase, legacySchema } from '@/app/database/foundation';
import { TransactionTarget } from '@/app/database/types/foundation';
import PortfolioRepository from '@/app/services/PortfolioRepository';
import BackupService from '@/app/services/BackupService';
import { parseBackup } from '@/app/services/backupFormat';
import { decimalDraft, transactionFromDraft } from '@/app/services/transactionValidation';

let db: Dexie, repo: PortfolioRepository, target: TransactionTarget, n = 0;
const trade = { id: 'trade', accountId: 'account', instrumentId: '188889c9-78c8-4536-854c-50e0c5e04aa4', type: 0, date: Date.UTC(2024, 0, 1), description: 'Synthetic', shares: 2, price: 10, brokerage: 1, tradeTime: '12:30' };
const freshTarget = async (repository = repo): Promise<TransactionTarget> => {
    const current = await repository.getTransaction(trade.id);
    return { commandId: crypto.randomUUID(), datasetId: current.datasetId, entityId: current.entity.entityId, expectedRevision: current.entity.revision, transactionId: trade.id };
};
const snapshot = () => Promise.all(allStores.map(store => db.table(store).toArray()));
beforeEach(async () => {
    jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-corrections-${++n}`); await db.open(); repo = new PortfolioRepository(db);
    await repo.createAccount({ id: 'account', name: 'Synthetic' }); await repo.createInstrument({ id: '188889c9-78c8-4536-854c-50e0c5e04aa4', ticker: null, currency: null, instrumentKind: null, exchange: null, isin: null, name: 'Synthetic' });
    await repo.createTransaction(trade); target = await freshTarget();
});
afterEach(async () => { jest.restoreAllMocks(); await db.delete(); db.close(); });

it('keeps identity and complete before/after history, including date/time, across restart', async () => {
    const changed = { ...trade, date: Date.UTC(2024, 9, 27), tradeTime: '00:00', price: 15 };
    const entity = await repo.updateTransaction(target, changed);
    db.close(); await db.open();
    expect((await repo.getTransaction(trade.id)).record).toEqual(changed);
    expect(entity).toMatchObject({ entityId: target.entityId, revision: target.commandId, deleted: false });
    expect(await db.table('outbox').get(target.commandId)).toMatchObject({ operationVersion: 4, baseRevision: target.expectedRevision, sequence: 5, payload: { before: trade, after: changed, entity } });
    const withoutTime = { ...changed }; delete (withoutTime as Partial<typeof trade>).tradeTime;
    await repo.updateTransaction(await freshTarget(), withoutTime);
    expect((await repo.getTransaction(trade.id)).record).not.toHaveProperty('tradeTime');
});

it.each(['update', 'delete'] as const)('deduplicates concurrent %s commands across connections and retries after restart', async kind => {
    const second = createPortfolioDatabase(db.name); await second.open(); const other = new PortfolioRepository(second);
    const change = (repository: PortfolioRepository) => kind === 'update' ? repository.updateTransaction(target, { ...trade, price: 11 }) : repository.deleteTransaction(target);
    try {
        const [a,b] = await Promise.all([change(repo), change(other)]); expect(a).toEqual(b);
        expect(await db.table('outbox').count()).toBe(5); expect((await db.table('localState').get('local')).nextSequence).toBe(6);
        second.close(); db.close(); await db.open(); const before = await snapshot();
        await change(repo); expect(await snapshot()).toEqual(before);
    } finally { second.close(); }
});

it.each(['update', 'delete'] as const)('rejects competing edit/%s commands from the same base revision', async kind => {
    const second = createPortfolioDatabase(db.name); await second.open(); const other = new PortfolioRepository(second);
    try {
        const next = { ...target, commandId: crypto.randomUUID() };
        const results = await Promise.allSettled([repo.updateTransaction(target, { ...trade, price: 11 }),
            kind === 'update' ? other.updateTransaction(next, { ...trade, price: 12 }) : other.deleteTransaction(next)]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
        expect(failed.reason.name).toBe('TransactionConflictError'); expect(await db.table('outbox').count()).toBe(5);
    } finally { second.close(); }
});

it('retries an old successful edit after deletion without resurrecting or overwriting history', async () => {
    const changed = { ...trade, price: 11 }; await repo.updateTransaction(target, changed);
    const deletion = await freshTarget(); await repo.deleteTransaction(deletion);
    const before = await snapshot(); await repo.updateTransaction(target, changed); await repo.deleteTransaction(deletion);
    expect(await snapshot()).toEqual(before); expect(await db.table('transactions').count()).toBe(0);
    await expect(repo.createTransaction(trade)).rejects.toThrow('Identity already reserved');
    await expect(repo.updateTransaction({ ...target, commandId: crypto.randomUUID() }, changed)).rejects.toThrow('changed in another tab');
    await expect(repo.getTransaction(trade.id)).rejects.toThrow('deleted');
    expect(await db.table('outbox').get(deletion.commandId)).toMatchObject({ payload: { before: changed, after: null, entity: { deleted: true } } });
});

it('rejects command ID reuse with different intent or values', async () => {
    await repo.updateTransaction(target, { ...trade, price: 11 }); const before = await snapshot();
    await expect(repo.updateTransaction(target, { ...trade, price: 12 })).rejects.toThrow('command ID');
    await expect(repo.deleteTransaction(target)).rejects.toThrow('command ID'); expect(await snapshot()).toEqual(before);
});

it.each(['id', 'accountId', 'instrumentId'] as const)('prevents %s reassignment', async field => {
    const before = await snapshot(); await expect(repo.updateTransaction(target, { ...trade, [field]: '9d6f965a-c832-440a-8df6-c06afe983e3b' })).rejects.toThrow('cannot be changed');
    expect(await snapshot()).toEqual(before);
});

it.each(['entityStates', 'outbox', 'localState'])('rolls back edit and delete when %s fails, then retries the same command', async store => {
    for (const kind of ['update', 'delete']) {
        const command = await freshTarget(), before = await snapshot();
        jest.spyOn(db.table(store), store === 'outbox' ? 'add' : 'put').mockRejectedValueOnce(new Error('Synthetic failure'));
        const change = () => kind === 'update' ? repo.updateTransaction(command, { ...trade, price: 11 }) : repo.deleteTransaction(command);
        await expect(change()).rejects.toThrow('Synthetic failure'); expect(await snapshot()).toEqual(before);
        jest.restoreAllMocks(); await change();
    }
});

it('rejects invalid corrections without mutation', async () => {
    const before = await snapshot();
    for (const patch of [{ price: 0 }, { shares: NaN }, { brokerage: -1 }, { date: Date.UTC(2024,0,1) + 1 }, { tradeTime: '25:00' }]) {
        await expect(repo.updateTransaction(target, { ...trade, ...patch })).rejects.toThrow();
    }
    expect(await snapshot()).toEqual(before);
});

it('round-trips a tombstone, blocks stale live merges in both directions, and supports explicit replacement recovery', async () => {
    const service = new BackupService(db), live = await service.exportBackup(); await repo.deleteTransaction(target);
    const deleted = await service.exportBackup(); expect(parseBackup(deleted).formatVersion).toBe(4);
    expect(parseBackup(deleted).identity.entities.find(row => row.entityId === target.entityId)?.deleted).toBe(true);
    const conflict = await service.preview(live, 'merge'); expect(conflict.conflicts.join()).toContain('deletion marker');
    const before = await snapshot(); await expect(service.restore(conflict, conflict.recoveryText)).rejects.toThrow('conflicting'); expect(await snapshot()).toEqual(before);
    let preview = await service.preview(deleted, 'replace'); await service.restore(preview, preview.recoveryText);
    expect((await db.table('outbox').toArray())[0]).toMatchObject({ kind: 'baseline', operationVersion: 4 });
    expect(await db.table('transactions').count()).toBe(0); expect((await db.table('entityStates').get(JSON.stringify(['transactions','trade']))).deleted).toBe(true);
    preview = await service.preview(live, 'replace'); await service.restore(preview, preview.recoveryText); expect(await db.table('transactions').count()).toBe(1);
    preview = await service.preview(deleted, 'merge'); expect(preview.conflicts.join()).toContain('deletion marker');
    await expect(service.restore(preview, preview.recoveryText)).rejects.toThrow('conflicting');
    await expect(repo.deleteTransaction(target)).rejects.toThrow('restored or replaced');
});

it('imports a missing tombstone even if all live rows match, and identical merge is a true no-op', async () => {
    const service = new BackupService(db); await repo.deleteTransaction(target); const backup = await service.exportBackup();
    const withoutMarker = parseBackup(backup); withoutMarker.identity.entities = withoutMarker.identity.entities.filter(row => !row.deleted);
    let preview = await service.preview(JSON.stringify(withoutMarker), 'replace'); await service.restore(preview, preview.recoveryText);
    const previous = (await db.table('localState').get('local')).datasetId;
    preview = await service.preview(backup, 'merge'); expect(preview.tombstones).toEqual({ current: 0, incoming: 1, result: 1 });
    await service.restore(preview, preview.recoveryText); expect((await db.table('localState').get('local')).datasetId).not.toBe(previous);
    preview = await service.preview(backup, 'merge'); const before = await snapshot(); await service.restore(preview, preview.recoveryText); expect(await snapshot()).toEqual(before);
});

it('rejects invalid tombstones and format-2 deletion markers', async () => {
    const service = new BackupService(db); await repo.deleteTransaction(target); const source = parseBackup(await service.exportBackup());
    for (const variant of ['duplicate', 'live', 'account', 'v2']) {
        const backup = structuredClone(source), marker = backup.identity.entities.find(row => row.deleted)!;
        if (variant === 'duplicate') backup.identity.entities.push({ ...marker, entityId: crypto.randomUUID() });
        if (variant === 'live') backup.records.transactions.push(trade);
        if (variant === 'account') { marker.store = 'accounts'; marker.key = JSON.stringify(['accounts', marker.recordKey]); }
        if (variant === 'v2') Object.assign(backup, { formatVersion: 2, databaseVersion: 2 });
        await expect(service.preview(JSON.stringify(backup), 'replace')).rejects.toThrow();
    }
});

it.each([1e-7, 1e21, Number.MIN_VALUE, 1.2345678901234567e-20])('retains exponent-form quantity %s when editing an unrelated field', value => {
    const result = transactionFromDraft({ type: 0, accountId: 'account', date: '2024-01-01', description: 'Corrected', shares: decimalDraft(value), price: '1', brokerage: '0' }, 'trade', '188889c9-78c8-4536-854c-50e0c5e04aa4');
    expect(result.shares).toBe(value);
});

it('retains tombstones, history and device state if a restore fails after clearing stores', async () => {
    const service = new BackupService(db); await repo.deleteTransaction(target); const plan = await service.preview(await service.exportBackup(), 'replace'), before = await snapshot();
    jest.spyOn(db.table('localState'), 'put').mockRejectedValueOnce(new Error('Synthetic restore failure'));
    await expect(service.restore(plan, plan.recoveryText)).rejects.toThrow('Synthetic restore failure'); expect(await snapshot()).toEqual(before);
    await service.restore(plan, plan.recoveryText); expect(await db.table('transactions').count()).toBe(0);
});
