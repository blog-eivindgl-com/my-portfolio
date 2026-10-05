export interface IStock {
    id: string;
    name: string;
    ticker: string | null;
    instrumentKind: 'share' | 'fund' | null;
    currency: string | null;
    exchange: string | null;
    isin: string | null;
}

export interface IAccount {
    id: string,
    name: string
}

export enum TransactionType {
    buy,
    sell
}

export interface ITransaction {
    [key: string]: any,
    id: string, 
    type: TransactionType, 
    instrumentId: string,
    accountId: string, 
    date: number,
    tradeOrder?: number, // Retained explicit historical domain order; never device sequence.
    tradeTime?: string, // Optional HH:mm wall time from the trade confirmation; no timezone conversion.
    description: string, 
    shares: number, 
    price: number, 
    brokerage: number
}

export interface IStockPrice {
    id: string,
    instrumentId: string,
    date: number,
    price: number
}

export interface IPriceList {
    // Transient calculation metadata; never stored in a quote record.
    observations?: Record<number, { id: string; source: 'quote' | 'transaction' }>,
    instrumentId: string,
    [date: number]: number
}
