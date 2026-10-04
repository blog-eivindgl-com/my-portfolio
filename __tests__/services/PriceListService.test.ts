/** @jest-environment node */
import PriceListService from '@/app/services/PriceListService';
import DbService from '@/app/services/DbService';
import TransactionService from '@/app/services/TransactionService';
import TransactionViewModel from '@/app/viewmodel/transactions/TransactionViewModel';
import { TransactionType } from '@/app/database/types/types';

const prices = new PriceListService(new DbService());
it('uses the latest valid observation at or before the valuation time, never a nearer future quote', () => {
    expect(prices.getPriceClosestToDate(100, { instrumentId: '11111111-1111-4111-8111-111111111111', 1: 10, 101: 50 })).toBe(10);
    expect(prices.getPriceAndDateClosestToDate(101, { instrumentId: '11111111-1111-4111-8111-111111111111', 1: 10, 101: 50 })?.date).toBe(101);
});
it('returns unknown for absent/future/invalid observations rather than zero', () => {
    expect(prices.getPriceClosestToDate(100, { instrumentId: '11111111-1111-4111-8111-111111111111' })).toBeUndefined();
    expect(prices.getPriceClosestToDate(100, { instrumentId: '11111111-1111-4111-8111-111111111111', 101: 50, 90: NaN, 80: Infinity, 70: -1 })).toBeUndefined();
});
it('does not discard a valid epoch-zero quote', () => {
    expect(prices.getPriceClosestToDate(10, { instrumentId: '11111111-1111-4111-8111-111111111111', 0: 12 })).toBe(12);
    expect(prices.getPriceAndDateClosestToDate(10, { instrumentId: '11111111-1111-4111-8111-111111111111', 0: 12 })?.date).toBe(0);
});
it('returns the closing transaction date instead of falling through forEach to today', () => {
    const closing = new TransactionViewModel({ id: 'close', instrumentId: '11111111-1111-4111-8111-111111111111', accountId: 'a', date: 100, type: TransactionType.sell, shares: 1, price: 12, brokerage: 0, description: '' });
    closing.sharesLeft = 0;
    expect(new TransactionService(prices).findLastPriceDateForUnrealizedWin(50, [closing])).toBe(100);
});

it('retains the applied quote identity, source and age', async () => {
    const db = new DbService();
    jest.spyOn(db, 'getPricesForTicker').mockResolvedValue([{ id: 'synthetic-quote', instrumentId: '11111111-1111-4111-8111-111111111111', date: 10, price: 12 }]);
    const list = await new PriceListService(db).getPriceListFromDb('11111111-1111-4111-8111-111111111111');
    expect(prices.getPriceAndDateClosestToDate(100, list)).toMatchObject({ id: 'synthetic-quote', source: 'quote', ageMilliseconds: 90, price: 12 });
});

it('marks the existing transaction fallback explicitly rather than masquerading as a quote', async () => {
    const db = new DbService();
    jest.spyOn(db, 'getPricesForTicker').mockResolvedValue([]);
    jest.spyOn(db, 'getTransactionsForTicker').mockResolvedValue([{ id: 'synthetic-trade', instrumentId: '11111111-1111-4111-8111-111111111111', accountId: 'A', date: 10, price: 12, shares: 1, type: TransactionType.buy, brokerage: 0, description: '' }]);
    const list = await new PriceListService(db).getPriceListForStock('11111111-1111-4111-8111-111111111111');
    expect(prices.getPriceAndDateClosestToDate(100, list)).toMatchObject({ id: 'synthetic-trade', source: 'transaction', ageMilliseconds: 90 });
});
