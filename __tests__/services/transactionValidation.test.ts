import { TransactionType } from '@/app/database/types/types';
import { formatTradeDate, localDateInput, parseTradeDate, transactionFromDraft, validateTransaction } from '@/app/services/transactionValidation';

const draft = {
    type: TransactionType.buy, accountId: 'synthetic-account', date: '2024-02-29',
    description: ' Synthetic trade ', shares: '1,25', price: '10.50', brokerage: '0',
};
const valid = () => transactionFromDraft(draft, 'synthetic-id', 'SYNTH');

describe('transaction input validation', () => {
    it('accepts fractional units, decimal comma/point, zero fees and trims description', () => {
        expect(valid()).toMatchObject({ shares: 1.25, price: 10.5, brokerage: 0, description: 'Synthetic trade' });
    });
    it.each(['', ' ', '-1', '0', 'NaN', 'Infinity', '0x10', '1e3', '1,000.50', '1 000', '1.2.3'])('rejects invalid quantity %j', shares => {
        expect(() => transactionFromDraft({ ...draft, shares }, 'id', 'SYNTH')).toThrow();
    });
    it.each([NaN, Infinity, -Infinity, 0, -1, '1'])('rejects bypassed quantity %j at the service boundary', shares => {
        expect(() => validateTransaction({ ...valid(), shares })).toThrow();
    });
    it.each([NaN, Infinity, 0, -1, '10'])('rejects invalid price %j', price => {
        expect(() => validateTransaction({ ...valid(), price })).toThrow();
    });
    it.each([NaN, Infinity, -1, '0'])('rejects invalid fee %j', brokerage => {
        expect(() => validateTransaction({ ...valid(), brokerage })).toThrow();
    });
    it('rejects blank fees instead of coercing them to zero', () => {
        expect(() => transactionFromDraft({ ...draft, brokerage: '' }, 'id', 'SYNTH')).toThrow();
    });
    it.each([{}, { id: '' }, { accountId: '' }, { ticker: '' }, { type: 2 }, { type: '0' }, { description: null }])('rejects malformed fields %j', override => {
        expect(() => validateTransaction(Object.keys(override).length ? { ...valid(), ...override } : {})).toThrow();
    });
    it('rejects overflow in the transaction value', () => {
        expect(() => validateTransaction({ ...valid(), shares: 1e308, price: 1e308 })).toThrow();
    });
    it('does not carry unknown properties into a stored record', () => {
        expect(validateTransaction({ ...valid(), token: 'synthetic-not-a-real-token' })).not.toHaveProperty('token');
    });
});

describe('calendar trade dates', () => {
    it.each(['', '2023-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-01-00', '2024-2-9', '0000-01-01', '2024-01-01T12:00:00Z'])('rejects invalid date %j', date => {
        expect(Number.isNaN(parseTradeDate(date))).toBe(true);
    });
    it('preserves leap dates through numeric storage and JSON roundtrip', () => {
        const restored = JSON.parse(JSON.stringify(valid()));
        expect(restored.date).toBe(Date.UTC(2024, 1, 29));
        expect(formatTradeDate(restored.date, 'en-CA')).toBe('2024-02-29');
    });
    it('handles early years without Date.UTC treating them as 1900-based', () => {
        expect(new Date(parseTradeDate('0099-01-02')).toISOString()).toBe('0099-01-02T00:00:00.000Z');
    });
    it.each([NaN, Infinity, 8640000000000001, Date.UTC(2024, 1, 29, 12), '2024-02-29'])('rejects invalid or non-day timestamps %j', date => {
        expect(() => validateTransaction({ ...valid(), date })).toThrow();
    });
    it('creates a complete local calendar input', () => {
        expect(localDateInput(new Date(2024, 0, 2, 23))).toBe('2024-01-02');
    });
});
