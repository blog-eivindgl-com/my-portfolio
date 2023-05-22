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
        .toArray();
    }
}