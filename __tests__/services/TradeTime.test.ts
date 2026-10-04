/** @jest-environment node */
import 'fake-indexeddb/auto';
import { createPortfolioDatabase } from '@/app/database/foundation';
import PortfolioRepository from '@/app/services/PortfolioRepository';
import BackupService from '@/app/services/BackupService';
import { parseBackup } from '@/app/services/backupFormat';
import { transactionFromDraft, validateTransaction } from '@/app/services/transactionValidation';
import { orderTransactions } from '@/app/services/tradeChronology';
import TransactionService from '@/app/services/TransactionService';
import PriceListService from '@/app/services/PriceListService';
import DbService from '@/app/services/DbService';

const date = Date.UTC(2024, 2, 31);
const trade = (id: string, tradeTime?: string) => ({ id, ticker: 'SYNTH', accountId: 'A', date, type: 0, shares: 1, price: 10, brokerage: 0, description: id, ...(tradeTime === undefined ? {} : { tradeTime }) });

it('leaves blank time absent while preserving explicit midnight', () => {
    const draft = { type: 0, accountId: 'A', date: '2024-03-31', shares: '1', price: '10', brokerage: '0', description: '' };
    expect(transactionFromDraft({ ...draft, tradeTime: '' }, 'one', 'SYNTH')).not.toHaveProperty('tradeTime');
    expect(transactionFromDraft({ ...draft, tradeTime: '00:00' }, 'two', 'SYNTH')).toMatchObject({ date, tradeTime: '00:00' });
});

it.each(['24:00', '12:60', '9:30', '12:30:01', '12:30Z', ' 12:30', '', null, 930])('rejects invalid persisted time %j', tradeTime => {
    expect(() => validateTransaction({ ...trade('bad'), tradeTime })).toThrow();
});

it('orders supplied wall times on the same trade date without mutating inputs or using save IDs', () => {
    const input = [trade('a-later', '15:30'), trade('z-earlier', '09:15')];
    expect(orderTransactions(input).transactions.map(row => row.id)).toEqual(['z-earlier', 'a-later']);
    expect(input.map(row => row.id)).toEqual(['a-later', 'z-earlier']);
    expect(orderTransactions(input).warnings).toEqual([]);
});

it('keeps unknown/equal times ambiguous, including daylight-saving repeated clock labels', () => {
    for (const rows of [[trade('a'), trade('b', '09:00')], [trade('a', '02:30'), trade('b', '02:30')]]) {
        expect(orderTransactions(rows).warnings).toHaveLength(1);
        const service = new TransactionService(new PriceListService(new DbService()));
        const list = service.getTransactionListViewModel(rows, undefined);
        expect(service.getTransactionsSummaryViewModel(list, undefined).orderWarning).toContain('order is unknown');
    }
    expect(orderTransactions([trade('a'), { ...trade('b'), accountId: 'B' }]).warnings).toEqual([]);
});

it('uses supplied buy/sell chronology with the existing accounting formulas', () => {
    const service = new TransactionService(new PriceListService(new DbService()));
    const list = service.getTransactionListViewModel([{ ...trade('sale', '15:00'), type: 1, price: 12 }, trade('buy', '09:00')], undefined);
    expect(list.TransactionViewModels.map(row => row.id)).toEqual(['buy', 'sale']);
    expect(list.TransactionViewModels[1].realizedWin).toBe(2);
});

it('preserves optional time through atomic persistence, operations, restart and backup restore', async () => {
    jest.useRealTimers();
    const db = createPortfolioDatabase('synthetic-trade-time');
    try {
        await db.open(); const repository = new PortfolioRepository(db);
        await repository.createAccount({ id: 'A', name: 'Synthetic' }); await repository.createInstrument({ ticker: 'SYNTH', name: 'Synthetic' });
        await repository.createTransaction(trade('later-created-first', '15:30'));
        await repository.createTransaction(trade('earlier-created-second', '09:00'));
        await repository.createTransaction(trade('unknown'));
        db.close(); await db.open();
        const operations = await db.table('outbox').toArray();
        const timeOperation = operations.find(row => row.kind === 'create' && row.payload.record.id === 'later-created-first');
        expect(timeOperation.payload.record.tradeTime).toBe('15:30');
        const service = new BackupService(db), exported = await service.exportBackup();
        const before = parseBackup(exported);
        const plan = await service.preview(exported, 'replace'); await service.restore(plan, plan.recoveryText);
        expect(parseBackup(await service.exportBackup()).records).toEqual(before.records);
        expect(before.records.transactions.find(row => row.id === 'unknown')).not.toHaveProperty('tradeTime');
        expect((await db.table('entityStates').toArray()).every(row => row.tradeOrder === null)).toBe(true);
        const bad = structuredClone(before); bad.records.transactions[0].tradeTime = '25:00';
        await expect(service.preview(JSON.stringify(bad), 'replace')).rejects.toThrow();
    } finally { await db.delete(); db.close(); }
});
