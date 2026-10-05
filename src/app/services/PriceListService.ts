import { IPriceList, IStockPrice } from "../database/types/types";
import DbService from "./DbService";

export default class PriceListService {
    constructor(private _dbService: DbService) { }

    async getPriceListForStock(instrumentId: string): Promise<IPriceList> {
        // Lookup price list from DB
        const priceList = await this.getPriceListFromDb(instrumentId);

        // Fill in price list by transactions for missing dates
        await this.fillInPriceListFromStockTransactions(priceList);

        return priceList;
    }

    async getPriceListFromDb(instrumentId: string): Promise<IPriceList> {
        const priceList: IPriceList = {
            instrumentId: instrumentId
        };
        const stockPrices = await this._dbService.getPricesForTicker(instrumentId);
        stockPrices?.forEach((sp) => {
            priceList[sp.date] = sp.price;
        });

        return priceList;
    }

    async fillInPriceListFromStockTransactions(priceList: IPriceList) {
        const instrumentId = priceList.instrumentId;
        const transactions = await this._dbService.getTransactionsForTicker(instrumentId);
        transactions?.forEach((t) => {
            if (priceList[t.date] === undefined) {
                priceList[t.date] = t.price;
            }
        });
    }

    getPriceListDateClosestToDate(date: number, priceList: IPriceList): number | undefined {
        const allDates = Object.keys(priceList).filter((key) => key !== "instrumentId").map(Number);
        
        if (allDates.length === 0) {
            return undefined;
        }

        return allDates.reduce((prev, curr) => {
            return (Math.abs(curr - date) < Math.abs(prev - date) ? curr : prev);
        });
    }

    getPriceClosestToDate(lastPriceDate: number, priceList: IPriceList): number {
        const closestDate = this.getPriceListDateClosestToDate(lastPriceDate, priceList);

        if (!closestDate) {
            return 0;
        }

        console.log(`Found price ${priceList[closestDate]} for date ${new Date(closestDate).toLocaleDateString()} closest to ${new Date(lastPriceDate).toLocaleDateString()}`);

        return priceList[closestDate];
    }

    getPriceAndDateClosestToDate(date: number, priceList: IPriceList): IStockPrice | undefined {
        const closestDate = this.getPriceListDateClosestToDate(date, priceList);

        if (!closestDate) {
            return undefined;
        }

        return {
            id: "",
            instrumentId: priceList.instrumentId,
            date: closestDate,
            price: priceList[closestDate]
        };
    }
}
