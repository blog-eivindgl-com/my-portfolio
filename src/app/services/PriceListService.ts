import { IPriceList } from "../database/types/types";
import DbService from "./DbService";

export default class PriceListService {
    constructor(private _dbService: DbService) { }

    getPriceListForStock(ticker: string): IPriceList {
        // Lookup price list from DB
        const priceList = this.getPriceListFromDb(ticker);

        // Fill in price list by transactions for missing dates
        this.fillInPriceListFromStockTransactions(priceList);

        return priceList;
    }

    getPriceListFromDb(ticker: string): IPriceList {
        // TODO: Read from DB and index prices per date
        return {
            ticker: ticker,
        };
    }

    fillInPriceListFromStockTransactions(priceList: IPriceList) {
        const ticker = priceList.ticker;
        const transactions = this._dbService.getTransactionsForTicker(ticker);
        transactions?.forEach((t) => {
            if (priceList[t.date] === undefined) {
                priceList[t.date] = t.price;
            }
        });
    }

    getPriceClosestToDate(lastPriceDate: number, priceList: IPriceList): number {
        const allDates = Object.keys(priceList).filter((key) => key !== "ticker").map(Number);
        
        if (allDates.length === 0) {
            return 0;
        }

        const closestDate = allDates.reduce((prev, curr) => {
            return (Math.abs(curr - lastPriceDate) < Math.abs(prev - lastPriceDate) ? curr : prev);
        });
        return priceList[closestDate];
    }
}