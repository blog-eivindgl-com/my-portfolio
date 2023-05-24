import { IStockPrice, ITransaction } from "../database/types/types";
import { stockPricesTable, transactionsTable } from "../database/database.config";

export default class DbService {
    constructor() {}

    async getPricesForTicker(ticker: string): Promise<IStockPrice[]> {
        return await stockPricesTable
        .where("ticker").equals(ticker)
        .toArray();
    }

    async getTransactionsForTicker(ticker: string): Promise<ITransaction[]> {
        return await transactionsTable
        .where("ticker").equals(ticker)
        .sortBy("order");
    }

    async getNextTransactionOrderValue(ticker: string): Promise<number> {
        return await transactionsTable.filter(t => t.ticker === ticker).count();
    }

    async addTransaction(transaction: ITransaction): Promise<void> {
        await transactionsTable.add(transaction);
    }
}