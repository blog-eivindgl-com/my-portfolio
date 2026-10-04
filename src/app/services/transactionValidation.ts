import { ITransaction, TransactionType } from '../database/types/types';

export type TransactionField = keyof TransactionDraft | 'id' | 'ticker' | 'form';
export type TransactionErrors = Partial<Record<TransactionField, string>>;

export interface TransactionDraft {
    type: TransactionType;
    accountId: string;
    date: string;
    tradeTime?: string;
    description: string;
    shares: string;
    price: string;
    brokerage: string;
}

export class TransactionValidationError extends Error {
    constructor(public readonly errors: TransactionErrors) {
        super('Check the highlighted transaction fields.');
        this.name = 'TransactionValidationError';
    }
}

// The input is a calendar date, not an instant in the user's local time zone.
// UTC midnight preserves the existing numeric storage format without a migration.
export function parseTradeDate(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || year > 9999) return NaN;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date.getTime() : NaN;
}

export function localDateInput(date = new Date()): string {
    return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function formatTradeDate(value: number, locale?: string): string {
    return new Date(value).toLocaleDateString(locale, { timeZone: 'UTC' });
}

// Existing finite numbers may stringify with an exponent, which entry deliberately rejects.
// Expand that notation without rounding so an unrelated correction preserves the amount.
export function decimalDraft(value: number): string {
    const [coefficient, exponent] = String(value).split('e');
    if (exponent === undefined) return coefficient;
    const digits = coefficient.replace('.', '');
    const point = (coefficient.includes('.') ? coefficient.indexOf('.') : coefficient.length) + Number(exponent);
    if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
    if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
    return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

// Accept either decimal separator, never grouping, exponent or hexadecimal syntax.
function parseDecimal(value: string): number {
    const text = value.trim();
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN;
    const result = Number(text.replace(',', '.'));
    // Do not silently turn a nonzero value smaller than Number can hold into zero.
    return result === 0 && /[1-9]/.test(text) ? NaN : result;
}

export function transactionFromDraft(draft: TransactionDraft, id: string, ticker: string): ITransaction {
    return validateTransaction({
        id, ticker, type: draft.type, accountId: draft.accountId,
        ...(draft.tradeTime ? { tradeTime: draft.tradeTime } : {}),
        date: parseTradeDate(draft.date), description: draft.description,
        shares: parseDecimal(draft.shares), price: parseDecimal(draft.price),
        brokerage: parseDecimal(draft.brokerage),
    });
}

// Runtime checks are deliberately repeated at the write boundary, not just the UI.
export function validateTransaction(value: unknown): ITransaction {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TransactionValidationError({ form: 'Provide a valid transaction.' });
    }
    const input = value as Record<string, unknown>;
    const errors: TransactionErrors = {};
    for (const field of ['id', 'ticker', 'accountId'] as const) {
        if (typeof input[field] !== 'string' || !(input[field] as string).trim()) {
            errors[field] = field === 'accountId' ? 'Select an account.' : `A valid ${field} is required.`;
        }
    }
    if (input.type !== TransactionType.buy && input.type !== TransactionType.sell) {
        errors.type = 'Choose Buy or Sell.';
    }
    const date = typeof input.date === 'number' && Number.isFinite(input.date) ? new Date(input.date) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999
        || parseTradeDate(date.toISOString().slice(0, 10)) !== input.date) {
        errors.date = 'Enter a complete, valid date (YYYY-MM-DD).';
    }
    for (const field of ['shares', 'price', 'brokerage'] as const) {
        const number = input[field];
        if (typeof number !== 'number' || !Number.isFinite(number)
            || (field === 'brokerage' ? number < 0 : number <= 0)) {
            errors[field] = field === 'brokerage'
                ? 'Enter a finite fee of zero or more. Use . or , for decimals, without grouping.'
                : `Enter a finite ${field === 'shares' ? 'quantity' : 'price'} greater than zero. Use . or , for decimals, without grouping.`;
        }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'tradeTime') && (typeof input.tradeTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.tradeTime))) {
        errors.tradeTime = 'Enter a valid time (HH:mm), or leave it blank when unknown.';
    }
    if (typeof input.description !== 'string') errors.description = 'Description must be text.';
    if (Object.keys(errors).length) throw new TransactionValidationError(errors);
    const transaction: ITransaction = {
        id: input.id as string, ticker: input.ticker as string, accountId: input.accountId as string,
        type: input.type as TransactionType, date: input.date as number,
        description: (input.description as string).trim(), shares: input.shares as number,
        price: input.price as number, brokerage: input.brokerage as number,
        ...(typeof input.tradeTime === 'string' ? { tradeTime: input.tradeTime } : {}),
    };
    if (!Number.isFinite(transaction.shares * transaction.price + transaction.brokerage)) {
        throw new TransactionValidationError({ shares: 'The transaction value is too large to store safely.' });
    }
    return transaction;
}
