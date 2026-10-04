import { IAccount, IStockPrice, ITransaction } from "../database/types/types";
import database, { accountsTable, stockTable, stockPricesTable, transactionsTable } from "../database/database.config";
import { TransactionValidationError, validateTransaction } from './transactionValidation';

export default class DbService {
    constructor() {}

    async getAccounts(): Promise<IAccount[]> {
        return accountsTable.orderBy('name').toArray();
    }

    async addTransaction(value: unknown): Promise<void> {
        const transaction = validateTransaction(value);
        // Lock reference stores with the write: a deletion cannot race validation.
        await database.transaction('rw', accountsTable, stockTable, transactionsTable, async () => {
            if (!await accountsTable.get(transaction.accountId)) {
                throw new TransactionValidationError({ accountId: 'This account no longer exists. Select an available account.' });
            }
            if (!await stockTable.get(transaction.ticker)) {
                throw new TransactionValidationError({ ticker: 'This instrument no longer exists. Return to the instrument list.' });
            }
            const existing: ITransaction | undefined = await transactionsTable.get(transaction.id);
            if (existing) {
                // Retrying one logical save is idempotent; never overwrite a record.
                if (Object.keys(transaction).every(key => existing[key] === transaction[key])) return;
                throw new TransactionValidationError({ form: 'This save ID already belongs to another transaction. Start a new transaction.' });
            }
            await transactionsTable.add(transaction);
        });
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
