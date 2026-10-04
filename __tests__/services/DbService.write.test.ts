/** @jest-environment node */
import 'fake-indexeddb/auto';
import { baseline, allStores, readDomain } from '@/app/database/foundation';
import database, { accountsTable, stockTable, transactionsTable } from '@/app/database/database.config';
import DbService from '@/app/services/DbService';
import { TransactionType } from '@/app/database/types/types';

const service = new DbService();
const trade = (id = 'synthetic-trade') => ({
    id, ticker: 'SYNTH', accountId: 'account-b', type: TransactionType.buy,
    date: Date.UTC(2024, 1, 29), description: 'Synthetic only', shares: 1.25, price: 10.5, brokerage: 0,
});

beforeEach(async () => {
    jest.useRealTimers();
    await database.delete();
    await database.open();
    await accountsTable.bulkAdd([{ id: 'account-a', name: 'Synthetic A' }, { id: 'account-b', name: 'Synthetic B' }]);
    await stockTable.add({ ticker: 'SYNTH', name: 'Synthetic instrument' });
    await database.transaction('rw', allStores, async () => baseline(database, await readDomain(database)));
});
afterAll(async () => { await database.delete(); database.close(); });

it('persists the selected account and fractional/date values, including after reopening storage', async () => {
    await service.addTransaction(trade());
    database.close();
    await database.open();
    expect(await transactionsTable.get('synthetic-trade')).toEqual(trade());
});

it.each(['missing', 'deleted'])('rejects a %s account without writing anything', async condition => {
    if (condition === 'deleted') await accountsTable.delete('account-b');
    await expect(service.addTransaction({ ...trade(), accountId: condition === 'missing' ? 'unknown' : 'account-b' })).rejects.toThrow();
    expect(await transactionsTable.count()).toBe(0);
});

it('rejects an instrument that no longer exists', async () => {
    await stockTable.delete('SYNTH');
    await expect(service.addTransaction(trade())).rejects.toThrow();
    expect(await transactionsTable.count()).toBe(0);
});

it.each([{ shares: NaN }, { price: Infinity }, { brokerage: -1 }, { type: 3 }, { date: NaN }, { accountId: '' }])('rejects direct service input %j before storage', async override => {
    await expect(service.addTransaction({ ...trade(), ...override })).rejects.toThrow();
    expect(await transactionsTable.count()).toBe(0);
});

it('deduplicates concurrent and repeated requests with the same save ID', async () => {
    await Promise.all([service.addTransaction(trade()), service.addTransaction(trade())]);
    await service.addTransaction(trade());
    expect(await transactionsTable.count()).toBe(1);
});

it('never overwrites a different record with the same save ID', async () => {
    await service.addTransaction(trade());
    await expect(service.addTransaction({ ...trade(), shares: 2 })).rejects.toThrow();
    expect(await transactionsTable.get('synthetic-trade')).toEqual(trade());
});

it('preserves identical legitimate trades with distinct save IDs', async () => {
    await service.addTransaction(trade('first-intent'));
    await service.addTransaction(trade('second-intent'));
    expect(await transactionsTable.count()).toBe(2);
});

it('rolls back a failed write and allows the same logical save to retry', async () => {
    const failure = jest.spyOn(transactionsTable, 'add').mockRejectedValueOnce(new Error('Synthetic storage failure'));
    await expect(service.addTransaction(trade())).rejects.toThrow('Synthetic storage failure');
    expect(await transactionsTable.count()).toBe(0);
    failure.mockRestore();
    await service.addTransaction(trade());
    expect(await transactionsTable.count()).toBe(1);
});
