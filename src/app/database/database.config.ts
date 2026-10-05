import { createPortfolioDatabase } from './foundation';
const database = createPortfolioDatabase();
export const stockTable = database.table('instruments');
export const accountsTable = database.table('accounts');
export const transactionsTable = database.table('transactions');
export const stockPricesTable = database.table('stockPrices');
export default database;
