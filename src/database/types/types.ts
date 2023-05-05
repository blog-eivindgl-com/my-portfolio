export interface IStock {
    ticker: string,
    name: string
}

export interface IAccount {
    id?: number,
    name: string
}

export enum TransactionType {
    buy,
    sell
}

export interface ITransaction {
    id: number, 
    type: TransactionType, 
    ticker: string, 
    accountId: number, 
    date: Date, 
    description: string, 
    shares: number, 
    price: number, 
    brokerage: number
}