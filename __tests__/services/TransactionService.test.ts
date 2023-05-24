import { IPriceList, IStockPrice, ITransaction } from "@/app/database/types/types";
import DbService from "../../src/app/services/DbService";
import PriceListService from "@/app/services/PriceListService";
import TransactionService from "@/app/services/TransactionService";
import TransactionsSummaryViewModel from "@/app/viewmodel/transactions/TransactionsSummaryViewModel";

//jest.mock("../../src/app/services/DbService");

const testTransactionsForTickerSalme: ITransaction[] = [
    {
        id: "1d8ef955-7744-40c1-88d4-8eddef86669e",
        date: 1683504000000,  // 8.5.2023
        order: 0,
        type: 0,
        description: "Kjøp i Salmon Evolution",
        accountId: "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
        ticker: "SALME",
        shares: 12,
        price: 7,
        brokerage: 79
    },
    {
        id: "b4aae0e3-af29-4b0a-83eb-8fd179c5e2d3",
        date: 1684195200000,  // 16.5.2023
        order: 2,
        type: 1,
        description: "Salg av Salmon Evolution",
        accountId: "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
        ticker: "SALME",
        shares: 40,
        price: 14,
        brokerage: 79
    },
    {
        id: "c894f81e-80c6-477d-bf9f-23f319fa4736",
        date: 1683590400000,  // 9.5.2023
        order: 1,
        type: 0,
        description: "Kjøp i Salmon Evolution",
        accountId: "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
        ticker: "SALME",
        shares: 50,
        price: 8,
        brokerage: 79
    },
    {
        id: "241694e0-b608-44f1-8427-831f35738193",
        date: 1684368000000,  // 18.05.2023
        order: 3,
        type: 1,
        description: "Salg av Salmon Evolution",
        accountId: "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
        ticker: "SALME",
        shares: 22,
        price: 15,
        brokerage: 79
    }
];

beforeAll(() => {
    
});

// getTransactionListViewModel tests
describe("TransactionService.getTransactionListViewModel", () => {
    const emptyStockPriceArray: IStockPrice[] = [];
    const mockDbService = jest.fn(() => ({
        getTransactionsForTicker: jest.fn(() => testTransactionsForTickerSalme),
        getPricesForTicker: jest.fn(() => emptyStockPriceArray)
      })) as unknown as jest.Mocked<DbService>;
    const dbService: DbService = {
        getPricesForTicker: mockDbService.getPricesForTicker,
        getTransactionsForTicker: mockDbService.getTransactionsForTicker,
        getNextTransactionOrderValue: jest.fn(() => new Promise<number>(() => 1)),
        addTransaction: jest.fn(() => new Promise<void>(() => {;}))
    };
    const priceListService = new PriceListService(dbService);
    const service = new TransactionService(priceListService, dbService);
    const dummyPriceList = {
        ticker: 'SALME'
    };
    const resultWithoutValidPriceList = service.getTransactionListViewModel(testTransactionsForTickerSalme, dummyPriceList);
    
    it("Returns a TransactionListViewModel with TransactionViewModels", () => {
        const result = resultWithoutValidPriceList;
        expect(result).not.toBeUndefined();
        expect(result.TransactionViewModels).toHaveLength(4);
    });
    it("Sorts transactions by order value", () => {
        const result = resultWithoutValidPriceList;
        expect(result.TransactionViewModels[0].transaction.order).toBe(0);
        expect(result.TransactionViewModels[1].transaction.order).toBe(1);
        expect(result.TransactionViewModels[2].transaction.order).toBe(2);
        expect(result.TransactionViewModels[3].transaction.order).toBe(3);
    });
    it("Calculates number of shares left after selling parts of the shares", () => {
        const result = resultWithoutValidPriceList;
        expect(result.TransactionViewModels[2].sharesLeft).toBe(22);
        expect(result.TransactionViewModels[3].sharesLeft).toBe(0);
    });
    it("Calculates average price for shares on every buy transaction", () => {
        const result = resultWithoutValidPriceList;
        const firstAveragePrice = 7;
        const secondAveragePrice = (7 * 12 + 8 * 50) / 62;
        expect(result.TransactionViewModels[0].averagePrice).toBe(firstAveragePrice);
        expect(result.TransactionViewModels[1].averagePrice).toBe(secondAveragePrice);
        expect(result.TransactionViewModels[2].averagePrice).toBe(secondAveragePrice);
        expect(result.TransactionViewModels[3].averagePrice).toBe(0);
    });
    it("Sums up brokerage on buy transaction, including the first sell transaction, but not corresponding sell transactions", () => {
        const result = resultWithoutValidPriceList;
        const firstAccumulatedBrokerage = 79;
        const secondAccumulatedBrokerage = 79 * 2;
        const thirdAccumulatedBrokerage = 79 * 3;
        const fourthAccumulatedBrokerage = 79;
        expect(result.TransactionViewModels[0].accumulatedBrokerage).toBe(firstAccumulatedBrokerage);
        expect(result.TransactionViewModels[1].accumulatedBrokerage).toBe(secondAccumulatedBrokerage);
        expect(result.TransactionViewModels[2].accumulatedBrokerage).toBe(thirdAccumulatedBrokerage);
        expect(result.TransactionViewModels[3].accumulatedBrokerage).toBe(fourthAccumulatedBrokerage);
    });
    it("Calculates unrealized win/loss with no current price information, based on current transaction price", async () => {
        const priceListService = new PriceListService(dbService);
        const priceList = await priceListService.getPriceListForStock("SALME");
        const result = service.getTransactionListViewModel(testTransactionsForTickerSalme, priceList);
        const currentPrice = 15;
        const firstUnrealizedWin = (currentPrice * 12) - (7 * 12 + 79);
        const secondUnrealizedWin = (currentPrice * 50) - (8 * 50 + 79);
        expect(result.TransactionViewModels[0].unrealizedWin).toBe(firstUnrealizedWin);
        expect(result.TransactionViewModels[1].unrealizedWin).toBe(secondUnrealizedWin);
        expect(result.TransactionViewModels[2].unrealizedWin).toBeUndefined();
        expect(result.TransactionViewModels[3].unrealizedWin).toBeUndefined();
    });
    it("Calculates realized win/loss for all sell transactions", () => {
        const result = resultWithoutValidPriceList;
        // sold shares * selling price - previous shares left * avg price + current shares left * avg price - brokerage
        const thirdRealizedWin = (40 * 14) - (62 * 7.80645) + (22 * 7.80645) - (79 * 3);
        const fourthRealizedWin = (22 * 15) - (22 * 7.80645) + 0 - 79;
        expect(result.TransactionViewModels[0].realizedWin).toBeUndefined();
        expect(result.TransactionViewModels[1].realizedWin).toBeUndefined();
        expect(result.TransactionViewModels[2].realizedWin).toBeCloseTo(thirdRealizedWin, 3);
        expect(result.TransactionViewModels[3].realizedWin).toBeCloseTo(fourthRealizedWin, 3);
    });
});
// --getTransactionListViewModel tests

// getTransactionsSummaryViewModel tests
describe("TransactionService.getTransactionsSummaryViewModel", () => {
    const emptyStockPriceArray: IStockPrice[] = [];
    const mockDbService = jest.fn(() => ({
        getTransactionsForTicker: jest.fn(() => testTransactionsForTickerSalme),
        getPricesForTicker: jest.fn(() => emptyStockPriceArray)
      })) as unknown as jest.Mocked<DbService>;
    const priceListService = new PriceListService(mockDbService);
    const service = new TransactionService(priceListService, mockDbService);

    it("Calculates unrealized win/loss for all transactions", async () => {
        const priceList = await priceListService.getPriceListForStock("SALME");
        const transactionListVMForSalme = service.getTransactionListViewModel(testTransactionsForTickerSalme, priceList);

        // Act
        const summaryVm = service.getTransactionsSummaryViewModel(transactionListVMForSalme, priceList);

        // Assert
        expect(summaryVm).toBeInstanceOf(TransactionsSummaryViewModel);

    });

});
// --getTransactionsSummaryViewModel tests