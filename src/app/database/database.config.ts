import Dexie from "dexie";

const database = new Dexie("my-portfolio");
database.version(1).stores({
    stocks: 'ticker, name',
    accounts: '++id, name',
    transactions: '++id, type, ticker, accountId, date, description, shares, price, brokerage'
});

export const stockTable = database.table('stocks');
export const accountsTable = database.table('accounts');
export const transactionsTable = database.table('transactions');

export default database;