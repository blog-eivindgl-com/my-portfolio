import { ITransaction } from "@/app/database/types/types";
import TransactionService from "@/app/services/TransactionService";
import TransactionListViewModel from "@/app/viewmodel/transactions/TransactionListViewModel";
import exp from "constants";

describe("TransactionService.getTransactionListViewModel", () => {
    const service = new TransactionService();
    const transactions: ITransaction[] = [
        {
            "id": "1d8ef955-7744-40c1-88d4-8eddef86669e",
            "date": 1683504000000,  // 8.5.2023
            "type": 0,
            "description": "Kjøp i Salmon Evolution",
            "accountId": "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
            "ticker": "SALME",
            "shares": 12,
            "price": 7,
            "brokerage": 79
        },
        {
            "id": "b4aae0e3-af29-4b0a-83eb-8fd179c5e2d3",
            "date": 1684195200000,  // 16.5.2023
            "type": 1,
            "description": "Salg av Salmon Evolution",
            "accountId": "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
            "ticker": "SALME",
            "shares": 40,
            "price": 14,
            "brokerage": 79
        },
        {
            "id": "c894f81e-80c6-477d-bf9f-23f319fa4736",
            "date": 1683590400000,  // 9.5.2023
            "type": 0,
            "description": "Kjøp i Salmon Evolution",
            "accountId": "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
            "ticker": "SALME",
            "shares": 50,
            "price": 8,
            "brokerage": 79
        },
        {
            "id": "241694e0-b608-44f1-8427-831f35738193",
            "date": 1684368000000,
            "type": 1,
            "description": "Salg av Salmon Evolution",
            "accountId": "5d6d80c7-cc32-43ea-bb46-2af800f026f3",
            "ticker": "SALME",
            "shares": 22,
            "price": 15,
            "brokerage": 79
        }
    ]
    const result = service.getTransactionListViewModel(transactions);
    it("Returns a TransactionListViewModel with TransactionViewModels", () => {
        expect(result).not.toBeUndefined();
        expect(result.TransactionViewModels).toHaveLength(4);
    });
    it("Sorts transactions by date", () => {
        expect(result.TransactionViewModels[0].date).toBe("8.5.2023");
        expect(result.TransactionViewModels[1].date).toBe("9.5.2023");
        expect(result.TransactionViewModels[2].date).toBe("16.5.2023");
        expect(result.TransactionViewModels[3].date).toBe("18.5.2023");
    });
    it("Calculates number of shares left after selling parts of the shares", () => {
        expect(result.TransactionViewModels[2].sharesLeft).toBe(22);
        expect(result.TransactionViewModels[3].sharesLeft).toBe(0);
    });
    it("Calculates average price for shares on every buy transaction", () => {
        const firstAveragePrice = 7;
        const secondAveragePrice = (7 * 12 + 8 * 50) / 62;
        expect(result.TransactionViewModels[0].averagePrice).toBe(firstAveragePrice);
        expect(result.TransactionViewModels[1].averagePrice).toBe(secondAveragePrice);
        expect(result.TransactionViewModels[2].averagePrice).toBe(secondAveragePrice);
        expect(result.TransactionViewModels[3].averagePrice).toBe(0);
    });
    it("Sums up brokerage on buy transaction, including the first sell transaction, but not corresponding sell transactions", () => {
        const firstAccumulatedBrokerage = 79;
        const secondAccumulatedBrokerage = 79 * 2;
        const thirdAccumulatedBrokerage = 79 * 3;
        const fourthAccumulatedBrokerage = 79;
        expect(result.TransactionViewModels[0].accumulatedBrokerage).toBe(firstAccumulatedBrokerage);
        expect(result.TransactionViewModels[1].accumulatedBrokerage).toBe(secondAccumulatedBrokerage);
        expect(result.TransactionViewModels[2].accumulatedBrokerage).toBe(thirdAccumulatedBrokerage);
        expect(result.TransactionViewModels[3].accumulatedBrokerage).toBe(fourthAccumulatedBrokerage);
    })
})