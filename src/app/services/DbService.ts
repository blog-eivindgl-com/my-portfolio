import { useLiveQuery } from "dexie-react-hooks";
import { ITransaction } from "../database/types/types";
import { transactionsTable } from "../database/database.config";

export default class DbService {
    constructor() {}

    getTransactionsForTicker(ticker: string): ITransaction[] {
        return useLiveQuery<Array<ITransaction>>(
            () => transactionsTable.where("ticker").equals(ticker).toArray(),
            [ticker]
        ) || [];
    }
}