import { IPriceList } from "../database/types/types";
import DbService from "./DbService";

export default class PriceListService {
    constructor(private _dbService: DbService) { }

    async getPriceListForStock(ticker: string): Promise<IPriceList> {
        // Lookup price list from DB
        const priceList = await this.getPriceListFromDb(ticker);

        // Fill in price list by transactions for missing dates
        await this.fillInPriceListFromStockTransactions(priceList);

        return priceList;
    }

    async getPriceListFromDb(ticker: string): Promise<IPriceList> {
        const priceList: IPriceList = {
            ticker: ticker
        };
        const stockPrices = await this._dbService.getPricesForTicker(ticker);
        stockPrices?.forEach((sp) => {
            priceList[sp.date] = sp.price;
        });

        return priceList;
    }

    async fillInPriceListFromStockTransactions(priceList: IPriceList) {
        const ticker = priceList.ticker;
        const transactions = await this._dbService.getTransactionsForTicker(ticker);
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

        console.log(`Found price ${priceList[closestDate]} for date ${new Date(closestDate).toLocaleDateString()} closest to ${new Date(lastPriceDate).toLocaleDateString()}`);

        return priceList[closestDate];
    }
}