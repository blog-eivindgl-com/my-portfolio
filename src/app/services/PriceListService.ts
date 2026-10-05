import { IPriceList, IStockPrice } from "../database/types/types";
import DbService from "./DbService";

export interface AppliedPrice extends IStockPrice {
    source: 'quote' | 'transaction' | 'unknown';
    ageMilliseconds: number;
}

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
            instrumentId: instrumentId,
            observations: {},
        };
        const stockPrices = await this._dbService.getPricesForTicker(instrumentId);
        stockPrices?.forEach((sp) => {
            priceList[sp.date] = sp.price;
            priceList.observations![sp.date] = { id: sp.id, source: 'quote' };
        });

        return priceList;
    }

    async fillInPriceListFromStockTransactions(priceList: IPriceList) {
        const instrumentId = priceList.instrumentId;
        const transactions = await this._dbService.getTransactionsForTicker(instrumentId);
        transactions?.forEach((t) => {
            if (priceList[t.date] === undefined) {
                priceList[t.date] = t.price;
                priceList.observations ??= {};
                priceList.observations[t.date] = { id: t.id, source: 'transaction' };
            }
        });
    }

    getPriceListDateClosestToDate(date: number, priceList: IPriceList): number | undefined {
        if (!Number.isFinite(date) || !Number.isFinite(new Date(date).getTime())) return undefined;
        const allDates = Object.keys(priceList).filter((key) => key !== "instrumentId").map(Number)
            .filter(value => Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) && value <= date
                && Number.isFinite(priceList[value]) && priceList[value] > 0);
        
        if (allDates.length === 0) {
            return undefined;
        }

        return allDates.reduce((prev, curr) => {
            return Math.max(prev, curr);
        });
    }

    getPriceClosestToDate(lastPriceDate: number, priceList: IPriceList): number | undefined {
        const closestDate = this.getPriceListDateClosestToDate(lastPriceDate, priceList);

        if (closestDate === undefined) {
            return undefined;
        }

        return priceList[closestDate];
    }

    getPriceAndDateClosestToDate(date: number, priceList: IPriceList): AppliedPrice | undefined {
        const closestDate = this.getPriceListDateClosestToDate(date, priceList);

        if (closestDate === undefined) {
            return undefined;
        }

        return {
            id: priceList.observations?.[closestDate]?.id || '',
            instrumentId: priceList.instrumentId,
            date: closestDate,
            price: priceList[closestDate],
            source: priceList.observations?.[closestDate]?.source || 'unknown',
            ageMilliseconds: date - closestDate,
        };
    }
}
