export interface IStock {
    ticker: string,
    name: string
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
    id: string, 
    type: TransactionType, 
    ticker: string, 
    accountId: number, 
    date: number, 
    description: string, 
    shares: number, 
    price: number, 
    brokerage: number
}