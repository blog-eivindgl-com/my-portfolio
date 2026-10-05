/** @jest-environment node */
import { calculatePortfolio, PortfolioInput } from '@/app/services/portfolioCalculations';
import { portfolioViewModels } from '@/app/services/portfolioViewModels';
const instrumentId = '11111111-1111-4111-8111-111111111111';
const trade = (id: string, accountId: string, day: number, type: number, price: number, shares: number, brokerage: number) => ({ id, accountId, instrumentId, date: Date.UTC(2024, 0, day), type, price, shares, brokerage, description: id });
const input: PortfolioInput = {
    accounts: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
    instruments: [{ id: instrumentId, name: 'Synthetic', ticker: null, currency: null, instrumentKind: null, isin: null, exchange: null }],
    transactions: [trade('a-buy', 'A', 1, 0, 100, 10, 10), trade('b-buy', 'B', 2, 0, 200, 10, 20), trade('a-sell', 'A', 3, 1, 120, 4, 2)],
    stockPrices: [{ id: 'quote', instrumentId, date: Date.UTC(2024, 0, 4), price: 110 }],
};
it('projects the same decimal rows and account sums into either presentation', () => {
    const report = calculatePortfolio(input, { asOf: Date.UTC(2024, 0, 5) });
    const before = JSON.stringify({ input, report });
    const combined = portfolioViewModels(report.positions, input.transactions);
    const accounts = report.positions.map(position => portfolioViewModels([position], input.transactions.filter(row => row.accountId === position.accountId)));
    for (const field of ['totalRealizedWin', 'currentInvestment', 'currentSharesLeft', 'currentUnrealizedWin', 'pendingFees'] as const) {
        expect(combined.summary[field]).toBe(accounts.reduce((sum, row) => sum + row.summary[field]!, 0));
    }
    expect(combined.summary).toMatchObject({ totalRealizedWin: 68, currentInvestment: 2600, currentSharesLeft: 16, pendingFees: 20 });
    for (const row of combined.list.TransactionViewModels) {
        expect(row).toEqual(accounts.flatMap(account => account.list.TransactionViewModels).find(item => item.id === row.id));
    }
    expect(combined.list.TransactionViewModels[2]).toMatchObject({ accumulatedBrokerage: 12, realizedWin: 68, averagePrice: 100 });
    expect(JSON.stringify({ input, report })).toBe(before);
});
it('keeps an ambiguous account unknown without changing valid account rows or claiming a complete aggregate', () => {
    const data = { ...input, transactions: input.transactions.map(row => row.id === 'a-sell' ? { ...row, date: input.transactions[0].date } : row) };
    const report = calculatePortfolio(data, { asOf: Date.UTC(2024, 0, 5) });
    const combined = portfolioViewModels(report.positions, data.transactions);
    expect(combined.summary.totalRealizedWin).toBeUndefined();
    expect(combined.summary.orderWarning).toContain('same-day');
    expect(combined.list.TransactionViewModels.find(row => row.id === 'b-buy')).toMatchObject({ calculationUnavailable: false, accumulatedBrokerage: 20, sharesLeft: 10 });
    expect(combined.list.TransactionViewModels.find(row => row.id === 'a-buy')?.calculationUnavailable).toBe(true);
});
it('does not display a zero balance when a decimal result exceeds the numeric UI range', () => {
    const data = { ...input, transactions: [trade('huge', 'A', 1, 0, 1e200, 1e200, 0)] };
    const report = calculatePortfolio(data, { asOf: Date.UTC(2024, 0, 5) });
    const models = portfolioViewModels(report.positions, data.transactions);
    expect(models.summary.currentInvestment).toBeUndefined();
    expect(models.list.TransactionViewModels[0].calculationUnavailable).toBe(true);
});
it('keeps the aggregate incomplete when a record has no usable identity', () => {
    const data = { ...input, transactions: [...input.transactions, trade('unidentified', '', 4, 0, 10, 1, 1)] };
    const report = calculatePortfolio(data, { asOf: Date.UTC(2024, 0, 5) });
    const models = portfolioViewModels(report.positions, data.transactions, report.issues);
    expect(models.summary.totalRealizedWin).toBeUndefined();
    expect(models.summary.currentInvestment).toBeUndefined();
    expect(models.summary.incompleteReason).toContain('no usable account/instrument identity');
});
