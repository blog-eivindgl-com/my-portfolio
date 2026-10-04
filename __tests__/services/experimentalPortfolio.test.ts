/** @jest-environment node */
import Decimal from 'decimal.js';
import { calculateExperimentalPortfolio, parseTrialTime, PortfolioInput, selectTrialQuote, trialMoney } from '@/app/services/experimentalPortfolio';
import { ITransaction, TransactionType } from '@/app/database/types/types';
import TransactionService from '@/app/services/TransactionService';
import PriceListService from '@/app/services/PriceListService';
import DbService from '@/app/services/DbService';

const day = (value: number) => Date.UTC(2023, 0, value);
const trade = (id: string, date: number, type: TransactionType, shares: number, price: number, brokerage = 0, accountId = 'A', instrumentId = '11111111-1111-4111-8111-111111111111'): ITransaction => ({ id, date: day(date), type, shares, price, brokerage, accountId, instrumentId, description: '' });
const buy = (id = 'buy', date = 1, quantity = 10, price = 100, fee = 10) => trade(id, date, 0, quantity, price, fee);
const sell = (id = 'sell', date = 2, quantity = 4, price = 120, fee = 2) => trade(id, date, 1, quantity, price, fee);
const input = (transactions: ITransaction[]): PortfolioInput => ({
    accounts: [{ id: 'A', name: 'Synthetic A' }, { id: 'B', name: 'Synthetic B' }],
    instruments: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Synthetic', ticker: 'SYNTH', instrumentKind: null, currency: null, exchange: null, isin: null }, { id: '22222222-2222-4222-8222-222222222222', name: 'Synthetic other', ticker: null, instrumentKind: null, currency: null, exchange: null, isin: null }],
    transactions, stockPrices: [{ id: 'quote', instrumentId: '11111111-1111-4111-8111-111111111111', date: day(10), price: 100 }],
});
const calculate = (data: PortfolioInput) => calculateExperimentalPortfolio(data, { asOf: day(20), staleAfterDays: 30 });

it('makes the disputed partial-sale components and cash/fee reconciliation explicit', () => {
    const position = calculate(input([buy(), sell()])).positions[0];
    expect(position).toMatchObject({ quantity: '6', remainingCost: '606', realizedGain: '74', marketValue: '600', unrealizedGain: '-6', buyFees: '10', allocatedBuyFees: '4', remainingBuyFees: '6', sellFees: '2', netCashFlow: '-532' });
    expect(position.ledger[1]).toMatchObject({ netProceeds: '478', releasedCost: '404', allocatedBuyFee: '4', realizedGain: '74' });
    expect(new Decimal(position.realizedGain!).plus(position.unrealizedGain!).toString()).toBe('68');
    expect(new Decimal(position.netCashFlow!).plus(position.marketValue!).toString()).toBe('68');
});

it('demonstrates the legacy 68/600/0 split without claiming that its policy was accepted', () => {
    const legacy = new TransactionService(new PriceListService(new DbService()));
    const prices = { instrumentId: '11111111-1111-4111-8111-111111111111', [day(10)]: 100 };
    const summary = legacy.getTransactionsSummaryViewModel(legacy.getTransactionListViewModel([buy(), sell()], prices), prices);
    expect(summary.totalRealizedWin).toBe(68);
    expect(summary.currentInvestment).toBe(600);
    expect(summary.currentUnrealizedWin).toBe(0);
});

it('includes purchase fees before any sale', () => {
    expect(calculate(input([buy()])).positions[0]).toMatchObject({ remainingCost: '1010', realizedGain: '0', unrealizedGain: '-10' });
});

it('allocates fees across repeated partial sales and closes without residual cost', () => {
    const position = calculate(input([buy(), sell(), sell('sell2', 3, 3, 120, 1), sell('sell3', 4, 3, 120, 1)])).positions[0];
    expect(position).toMatchObject({ status: 'closed', quantity: '0', remainingCost: '0', averageCost: '0', realizedGain: '186', unrealizedGain: '0', allocatedBuyFees: '10', remainingBuyFees: '0', sellFees: '4' });
    expect(position.ledger.filter(row => row.type === 1).map(row => row.allocatedBuyFee)).toEqual(['4', '3', '3']);
});

it('restarts remaining cost on rebuy without losing prior realized gains', () => {
    expect(calculate(input([buy(), sell('close', 2, 10, 120, 2), buy('rebuy', 3, 5, 80, 5)])).positions[0]).toMatchObject({ quantity: '5', remainingCost: '405', realizedGain: '188', unrealizedGain: '95', allocatedBuyFees: '10', remainingBuyFees: '5' });
});

it('isolates accounts then reconciles their same-instrument totals', () => {
    const report = calculate(input([buy('a', 1, 10, 100, 0), trade('b', 2, 0, 10, 200, 0, 'B'), sell('sale-a', 3, 10, 120, 0)]));
    expect(report.positions[0]).toMatchObject({ accountId: 'A', realizedGain: '200', quantity: '0' });
    expect(report.positions[1]).toMatchObject({ accountId: 'B', remainingCost: '2000', quantity: '10' });
    expect(report.instruments[0]).toMatchObject({ realizedGain: '200', remainingCost: '2000', marketValue: '1000', unrealizedGain: '-1000' });
});

it('uses decimal units and fully closes 0.1 + 0.2 without binary residue', () => {
    expect(calculate(input([buy('a', 1, .1, 1.1, 0), buy('b', 2, .2, 1.2, 0), sell('c', 3, .3, 2, .01)])).positions[0]).toMatchObject({ quantity: '0', remainingCost: '0', realizedGain: '0.24' });
});

it('is deterministic for backdated inputs and same-type same-day rows without mutating arrays or Decimal global settings', () => {
    const records = [{ ...buy('z', 1, 5, 100, 1), tradeOrder: 1 }, { ...buy('a', 1, 5, 200, 2), tradeOrder: 2 }, sell('s', 3, 4, 180, 2)];
    const data = input(records);
    const serialized = JSON.stringify(data), precision = Decimal.precision;
    expect(calculate(data)).toEqual(calculate(input([...records].reverse())));
    expect(JSON.stringify(data)).toBe(serialized);
    expect(Decimal.precision).toBe(precision);
});

it('flags mixed same-day events instead of allowing IDs/input order to determine cost basis', () => {
    const report = calculate(input([buy('z', 1), sell('a', 1)]));
    expect(report.positions[0].issues[0].code).toBe('same-day-order');
    expect(report.positions[0].realizedGain).toBeNull();
    expect(report.instruments[0].status).toBe('incomplete');
    expect(report.positions[0].ledger.every(row => row.status === 'blocked' && row.costAfter === null)).toBe(true);
});

it('flags oversells without borrowing another account holding or presenting a partial ledger', () => {
    const report = calculate(input([buy('a', 1, 2, 100, 0), trade('b', 1, 0, 100, 100, 0, 'B'), sell('s', 2, 3, 120, 0)]));
    expect(report.positions[0].issues[0].code).toBe('oversell');
    expect(report.positions[0].remainingCost).toBeNull();
    expect(report.positions[1].remainingCost).toBe('10000');
    expect(report.instruments[0].remainingCost).toBeNull();
});

it('excludes future trades and quotes at an explicit cutoff while retaining future ledger rows', () => {
    const data = input([buy(), sell('future', 3, 10, 120, 0)]);
    const report = calculateExperimentalPortfolio(data, { asOf: day(2) });
    expect(report.futureTransactions).toBe(1);
    expect(report.positions[0]).toMatchObject({ quantity: '10', remainingCost: '1010', realizedGain: '0', marketValue: null, unrealizedGain: null });
    expect(report.positions[0].ledger[1].status).toBe('future');
    expect(report.positions[0].quote.ignoredFuture).toBe(1);
});

it('shows zero current unrealized value for a closed holding without needing a quote', () => {
    expect(calculate({ ...input([buy(), sell('close', 2, 10, 120, 2)]), stockPrices: [] }).positions[0]).toMatchObject({ status: 'closed', remainingCost: '0', marketValue: '0', unrealizedGain: '0', realizedGain: '188' });
});

it('keeps absent market values unknown and never substitutes a transaction price', () => {
    expect(calculate({ ...input([buy()]), stockPrices: [] }).positions[0]).toMatchObject({ marketValue: null, unrealizedGain: null, quote: { status: 'missing', price: null } });
});

it('uses only the latest eligible actual quote with provenance and an explicit stale status', () => {
    const quotes = [{ id: 'past', instrumentId: '11111111-1111-4111-8111-111111111111', date: day(1), price: 110 }, { id: 'future', instrumentId: '11111111-1111-4111-8111-111111111111', date: day(20) + 1, price: 999 }];
    expect(selectTrialQuote('11111111-1111-4111-8111-111111111111', quotes, day(20), 7)).toMatchObject({ status: 'stale', price: '110', date: day(1), ids: ['past'], ageMilliseconds: 19 * 86_400_000, ignoredFuture: 1 });
    expect(calculateExperimentalPortfolio({ ...input([buy()]), stockPrices: quotes }, { asOf: day(20), staleAfterDays: 7 }).instruments[0].status).toBe('stale');
});

it('does not silently pick a conflicting latest quote or an older fallback', () => {
    expect(selectTrialQuote('11111111-1111-4111-8111-111111111111', [{ id: 'old', instrumentId: '11111111-1111-4111-8111-111111111111', date: day(1), price: 90 }, { id: 'a', instrumentId: '11111111-1111-4111-8111-111111111111', date: day(2), price: 100 }, { id: 'b', instrumentId: '11111111-1111-4111-8111-111111111111', date: day(2), price: 101 }], day(3), 7)).toMatchObject({ status: 'conflicting', price: null, ids: ['a', 'b'] });
});

it('retains identical-quote provenance, epoch zero, and counts rejected invalid observations', () => {
    expect(selectTrialQuote('11111111-1111-4111-8111-111111111111', [{ id: 'b', instrumentId: '11111111-1111-4111-8111-111111111111', date: 0, price: 12 }, { id: 'a', instrumentId: '11111111-1111-4111-8111-111111111111', date: 0, price: 12 }, { id: 'bad', instrumentId: '11111111-1111-4111-8111-111111111111', date: 1, price: NaN }], 10, 7)).toMatchObject({ price: '12', ids: ['a', 'b'], date: 0, ignoredInvalid: 1 });
});

it.each([{ shares: NaN }, { price: Infinity }, { type: 9 }, { date: NaN }, { accountId: 'missing' }, { id: '' }])('blocks invalid records %j without numeric gain artifacts', override => {
    const report = calculate(input([{ ...buy(), ...override }]));
    expect(report.positions[0].status).toBe('invalid');
    expect(report.positions[0].realizedGain).toBeNull();
    expect(JSON.stringify(report)).not.toContain('NaN');
    expect(JSON.stringify(report)).not.toContain('Infinity');
});

it('rejects duplicate IDs and marks unidentified records as globally incomplete', () => {
    expect(calculate(input([buy(), buy()])).positions[0].issues.some(row => row.code === 'duplicate')).toBe(true);
    const report = calculate(input([buy(), { ...sell(), accountId: '' }]));
    expect(report.issues[0].code).toBe('identity');
    expect(report.instruments[0].remainingCost).toBeNull();
});

it('keeps different instruments separate without an invented total currency amount', () => {
    const report = calculate(input([buy(), trade('other', 1, 0, 10, 200, 0, 'A', '22222222-2222-4222-8222-222222222222')]));
    expect(report.instruments).toHaveLength(2);
    expect(report).not.toHaveProperty('portfolioValue');
});

it('documents half-up display rounding while leaving calculation strings intact', () => {
    expect(trialMoney('1.005')).toBe('1.01');
    expect(trialMoney('-1.005')).toBe('-1.01');
    expect(trialMoney(null)).toBe('Unknown');
});

it('validates UTC cutoff text and rejects invalid replay options', () => {
    expect(parseTrialTime('2024-02-29T12:34:56')).toBe(Date.UTC(2024, 1, 29, 12, 34, 56));
    for (const value of ['2023-02-29T12:00', '2024-01-01T25:00', '2024-01-01T12:60', '']) expect(Number.isNaN(parseTrialTime(value))).toBe(true);
    expect(() => calculateExperimentalPortfolio(input([]), { asOf: NaN })).toThrow();
    expect(() => selectTrialQuote('11111111-1111-4111-8111-111111111111', [], NaN, 7)).toThrow();
});

it.each(['time', 'retained order'] as const)('uses known %s before IDs for same-day replay', evidence => {
    const records = evidence === 'time'
        ? [{ ...sell('a', 1), tradeTime: '14:00' }, { ...buy('z', 1), tradeTime: '09:00' }]
        : [{ ...sell('a', 1), tradeOrder: 20 }, { ...buy('z', 1), tradeOrder: 10 }];
    const report = calculate(input(records));
    expect(report.positions[0]).toMatchObject({ realizedGain: '74', remainingCost: '606' });
    expect(report.positions[0].ledger.map(row => row.id)).toEqual(['z', 'a']);
    expect(calculate(input([...records].reverse()))).toEqual(report);
});

it.each([
    [{}, {}],
    [{ tradeTime: '09:00' }, {}],
    [{ tradeTime: '09:00' }, { tradeTime: '09:00' }],
    [{ tradeOrder: 1 }, { tradeOrder: 1 }],
    [{ tradeOrder: 1, tradeTime: '14:00' }, { tradeOrder: 2, tradeTime: '09:00' }],
])('keeps missing, equal and contradictory same-day evidence blocked: %j', (first, second) => {
    const report = calculate(input([{ ...buy('z', 1), ...first }, { ...sell('a', 1), ...second }]));
    expect(report.positions[0].issues.some(issue => issue.code === 'same-day-order')).toBe(true);
    expect(report.positions[0].remainingCost).toBeNull();
});

it('does not make same-type display ordering into accounting evidence', () => {
    expect(calculate(input([buy('z', 1), buy('a', 1)])).positions[0].status).toBe('invalid');
});

it('includes the entire trade calendar day without treating a wall clock label as a UTC instant', () => {
    const report = calculateExperimentalPortfolio(input([{ ...buy(), tradeTime: '23:59' }]), { asOf: day(1) + 1 });
    expect(report.positions[0].remainingCost).toBe('1010');
    expect(report.positions[0].ledger[0].tradeTime).toBe('23:59');
});

it('keeps identical or missing tickers and metadata separate by native instrument identity', () => {
    const data = input([buy(), trade('other', 1, 0, 2, 200, 0, 'A', '22222222-2222-4222-8222-222222222222')]);
    data.instruments = data.instruments.map(row => ({ ...row, ticker: 'SAME' }));
    const report = calculate(data);
    expect(report.positions.map(row => row.remainingCost)).toEqual(['1010', '400']);
    expect(report.positions[1].marketValue).toBeNull();
    expect(calculate({ ...data, instruments: data.instruments.map(row => ({ ...row, name: 'Renamed', ticker: null, currency: null })) })).toEqual(report);
});
