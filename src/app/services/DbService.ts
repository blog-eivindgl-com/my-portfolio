import { IAccount, IStockPrice, ITransaction } from "../database/types/types";
import { accountsTable, stockPricesTable, transactionsTable } from "../database/database.config";
import { resolveInstrument } from './instrumentLookup';
import PortfolioRepository from './PortfolioRepository';

export default class DbService {
    constructor() {}
    resolveInstrument(reference: string) { return resolveInstrument(reference); }

    async getAccounts(): Promise<IAccount[]> {
        return accountsTable.orderBy('name').toArray();
    }

    async addTransaction(value: unknown): Promise<void> {
        return new PortfolioRepository().createTransaction(value);
    }

    async getPricesForTicker(instrumentId: string): Promise<IStockPrice[]> {
        instrumentId = (await resolveInstrument(instrumentId)).id;
        return await stockPricesTable
        .where("instrumentId").equals(instrumentId)
        .toArray();
    }

    async getTransactionsForTicker(instrumentId: string): Promise<ITransaction[]> {
        instrumentId = (await resolveInstrument(instrumentId)).id;
        return await transactionsTable
        .where("instrumentId").equals(instrumentId)
        .toArray();
    }
}
