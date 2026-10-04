/** @jest-environment node */
import TransactionService from '@/app/services/TransactionService';
import PriceListService from '@/app/services/PriceListService';
import DbService from '@/app/services/DbService';
import { ITransaction, TransactionType } from '@/app/database/types/types';

const service = new TransactionService(new PriceListService(new DbService()));
const trade = (id: string, accountId: string, day: number, shares: number, price: number, type = TransactionType.buy, instrumentId = '11111111-1111-4111-8111-111111111111'): ITransaction => ({
    id, accountId, instrumentId, date: Date.UTC(2023, 0, day), shares, price, type, brokerage: 0, description: '',
});

it('keeps account A cost separate from B and reconciles the same-instrument summary', () => {
    const rows = [trade('a-buy', 'A', 1, 10, 100), trade('b-buy', 'B', 2, 10, 200), trade('a-sell', 'A', 3, 10, 120, TransactionType.sell)];
    const list = service.getTransactionListViewModel(rows, undefined);
    expect(list.TransactionViewModels[2].realizedWin).toBe(200);
    expect(list.TransactionViewModels[1].averagePrice).toBe(200);
    expect(list.TransactionViewModels[2].sharesLeft).toBe(0);
    const summary = service.getTransactionsSummaryViewModel(list, { instrumentId: '11111111-1111-4111-8111-111111111111', [Date.UTC(2023, 0, 3)]: 120 });
    expect(summary.totalRealizedWin).toBe(200);
    expect(summary.currentInvestment).toBe(2000);
    expect(summary.currentSharesLeft).toBe(10);
    expect(summary.currentUnrealizedWin).toBe(-800);
});

it('does not mutate input ordering or borrow another instrument cost/price in the same account', () => {
    const rows = [trade('sell', 'A', 3, 10, 120, TransactionType.sell), trade('other', 'A', 2, 10, 500, TransactionType.buy, '22222222-2222-4222-8222-222222222222'), trade('buy', 'A', 1, 10, 100)];
    const original = rows.map(row => row.id);
    const list = service.getTransactionListViewModel(rows, { instrumentId: '22222222-2222-4222-8222-222222222222', [Date.UTC(2023, 0, 3)]: 600 });
    expect(rows.map(row => row.id)).toEqual(original);
    expect(list.TransactionViewModels[2].realizedWin).toBe(200);
    expect(list.TransactionViewModels[0].unrealizedWin).toBeUndefined();
    const summary = service.getTransactionsSummaryViewModel(list, { instrumentId: '22222222-2222-4222-8222-222222222222', [Date.UTC(2023, 0, 3)]: 600 });
    expect(summary.totalRealizedWin).toBeUndefined();
    expect(summary.currentInvestment).toBeUndefined();
    expect(summary.incompleteReason).toContain('Mixed instruments');
});

it('does not turn an absent market value into zero or a fabricated loss', () => {
    const list = service.getTransactionListViewModel([trade('buy', 'A', 1, 10, 100)], undefined);
    const summary = service.getTransactionsSummaryViewModel(list, { instrumentId: '11111111-1111-4111-8111-111111111111' });
    expect(summary.currentSharesLeft).toBe(10);
    expect(summary.currentPrice).toBeUndefined();
    expect(summary.currentUnrealizedWin).toBeUndefined();
});
