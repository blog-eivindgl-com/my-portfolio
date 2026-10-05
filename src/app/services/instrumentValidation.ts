import { IStock } from '../database/types/types';
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// Unknown historical metadata is null; never derive it from ticker, venue or price.
export function validateInstrument(value: unknown): IStock {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provide an instrument.');
    const row = value as Record<string, unknown>;
    const fields = ['id', 'name', 'ticker', 'instrumentKind', 'currency', 'exchange', 'isin'];
    if (Object.keys(row).length !== fields.length || fields.some(key => !Object.prototype.hasOwnProperty.call(row, key))
        || !isUuid(row.id) || typeof row.name !== 'string' || !row.name.trim()) throw new Error('Invalid instrument identity or fields.');
    for (const key of ['ticker', 'exchange', 'isin']) if (row[key] !== null && (typeof row[key] !== 'string' || !(row[key] as string).trim())) throw new Error(`Invalid instrument ${key}.`);
    if (row.instrumentKind !== null && row.instrumentKind !== 'share' && row.instrumentKind !== 'fund') throw new Error('Choose share or fund, or leave the kind unknown.');
    // A currency code is explicit data, not an FX or accounting-policy inference.
    if (row.currency !== null && (typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency))) throw new Error('Currency must be an explicit three-letter uppercase code or unknown.');
    if (row.isin !== null && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row.isin as string)) throw new Error('ISIN must contain 12 uppercase letters/digits in ISIN format.');
    return { id: row.id, name: row.name, ticker: row.ticker as string | null, instrumentKind: row.instrumentKind as IStock['instrumentKind'], currency: row.currency as string | null, exchange: row.exchange as string | null, isin: row.isin as string | null };
}
