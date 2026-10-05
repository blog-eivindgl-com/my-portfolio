/** @jest-environment node */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { allStores, createPortfolioDatabase, legacySchema } from '@/app/legacy/database/foundation';
import { TransactionTarget } from '@/app/legacy/database/types/foundation';
import PortfolioRepository from '@/app/legacy/services/PortfolioRepository';
import BackupService from '@/app/legacy/services/BackupService';
import { parseBackup } from '@/app/legacy/services/backupFormat';
import { decimalDraft, transactionFromDraft } from '@/app/legacy/services/transactionValidation';

let db: Dexie, repo: PortfolioRepository, target: TransactionTarget, n = 0;
const trade = { id: 'trade', accountId: 'account', ticker: 'SYNTH', type: 0, date: Date.UTC(2024, 0, 1), description: 'Synthetic', shares: 2, price: 10, brokerage: 1, tradeTime: '12:30' };
const freshTarget = async (repository = repo): Promise<TransactionTarget> => {
    const current = await repository.getTransaction(trade.id);
    return { commandId: crypto.randomUUID(), datasetId: current.datasetId, entityId: current.entity.entityId, expectedRevision: current.entity.revision, transactionId: trade.id };
};
const snapshot = () => Promise.all(allStores.map(store => db.table(store).toArray()));
beforeEach(async () => {
    jest.useRealTimers(); db = createPortfolioDatabase(`synthetic-corrections-${++n}`); await db.open(); repo = new PortfolioRepository(db);
    await repo.createAccount({ id: 'account', name: 'Synthetic' }); await repo.createInstrument({ ticker: 'SYNTH', name: 'Synthetic' });
    await repo.createTransaction(trade); target = await freshTarget();
});
afterEach(async () => { jest.restoreAllMocks(); await db.delete(); db.close(); });

it('upgrades v2 without rewriting its records, identity, device sequence or history', async () => {
    const before = await snapshot(); await db.delete();
    const old = new Dexie(db.name); old.version(2).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' });
    await old.open(); for (let i=0;i<allStores.length;i++) await old.table(allStores[i]).bulkAdd(before[i]); old.close();
    await db.open(); expect(db.verno).toBe(3); expect(await snapshot()).toEqual(before);
});

it('refuses unknown v2 stores without removing them', async () => {
    const before = await snapshot(); await db.delete();
    const old = new Dexie(db.name); old.version(2).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId', evidence: 'id' });
    await old.open(); for (let i=0;i<allStores.length;i++) await old.table(allStores[i]).bulkAdd(before[i]);
    await old.table('evidence').add({ id: 'retain', value: 'synthetic' }); old.close();
    await expect(db.open()).rejects.toThrow('Unsupported historical store layout');
    const retained = new Dexie(db.name); try { await retained.open(); expect(retained.verno).toBe(2); expect(await retained.table('evidence').get('retain')).toEqual({ id: 'retain', value: 'synthetic' }); } finally { retained.close(); }
});

it('rejects an invalid v2 identity and leaves the original version and data intact', async () => {
    const before = await snapshot(); await db.delete();
    const old = new Dexie(db.name); old.version(2).stores({ ...legacySchema, localState: 'id', entityStates: 'key,&entityId,store,recordKey', outbox: 'id,&[deviceId+sequence],datasetId' });
    await old.open(); for (let i=0;i<allStores.length;i++) await old.table(allStores[i]).bulkAdd(before[i]);
    await old.table('entityStates').update(JSON.stringify(['transactions', 'trade']), { revision: 'invalid' }); old.close();
    await expect(db.open()).rejects.toThrow();
    const retained = new Dexie(db.name); try { await retained.open(); expect(retained.verno).toBe(2); expect(await retained.table('transactions').get('trade')).toEqual(trade); expect((await retained.table('entityStates').get(JSON.stringify(['transactions', 'trade']))).revision).toBe('invalid'); } finally { retained.close(); }
});