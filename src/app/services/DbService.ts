import { IAccount, IStockPrice, ITransaction } from "../database/types/types";
import { accountsTable, stockPricesTable, transactionsTable } from "../database/database.config";
import PortfolioRepository from './PortfolioRepository';

export default class DbService {
    constructor() {}

    async getAccounts(): Promise<IAccount[]> {
        return accountsTable.orderBy('name').toArray();
    }

    async addTransaction(value: unknown): Promise<void> {
        return new PortfolioRepository().createTransaction(value);
    }

    async getPricesForTicker(ticker: string): Promise<IStockPrice[]> {
        return await stockPricesTable
        .where("ticker").equals(ticker)
        .toArray();
    }

    async getTransactionsForTicker(ticker: string): Promise<ITransaction[]> {
        return await transactionsTable
        .where("ticker").equals(ticker)
        .toArray();
    }
}
