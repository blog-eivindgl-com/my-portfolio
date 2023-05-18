import { IPriceList, IStockPrice, ITransaction, TransactionType } from "../database/types/types";
import TransactionListViewModel from "../viewmodel/transactions/TransactionListViewModel";
import TransactionViewModel from "../viewmodel/transactions/TransactionViewModel";
import PriceListService from "./PriceListService";

export default class TransactionService {
    constructor(private _priceListService: PriceListService) {}

    getTransactionListViewModel(transactions: ITransaction[] | undefined, priceList: IPriceList): TransactionListViewModel {
        if (transactions === undefined) {
            return new TransactionListViewModel([]);
        }

        const tlvm = new TransactionListViewModel(
            transactions.sort((t1, t2) => t1.date - t2.date)
            .map(t => new TransactionViewModel(t)));

        // Calculate values not dependent on future transactions
        let sharesLeft = 0;
        let averagePrice = 0;
        tlvm.TransactionViewModels.forEach((vm, index) => {
            let previousVm = (index === 0 ? null : tlvm.TransactionViewModels[index-1]);
            let previousSharesLeft = sharesLeft;

            // Calculate shares left
            sharesLeft = this.calculsateSharesLeft(vm, sharesLeft);

            // Calculate average price on each buy
            averagePrice = this.calculateAveragePrice(vm, averagePrice, previousSharesLeft);

            // Calculate accumulated brokerage on each buy and first sale
            this.calculateAccumulatedBrokerage(vm, previousVm);
        });

        // Calculate values that depends on values of other transactions coming after in the list
        tlvm.TransactionViewModels.forEach((vm, index, all) => {
            this.calculateUnrealizedWin(vm, priceList, all.slice(index));
        });
        return tlvm;
    }

    calculsateSharesLeft(vm: TransactionViewModel, currentSharesLeft: number): number {
        if (vm.transaction.type === TransactionType.buy) {
            currentSharesLeft += vm.shares;
            vm.sharesLeft = currentSharesLeft;
        } else {
            currentSharesLeft -= vm.shares;
            vm.sharesLeft = currentSharesLeft;
        }

        return currentSharesLeft;
    }

    calculateAveragePrice(vm: TransactionViewModel, currentAveragePrice: number, previousSharesLeft: number): number {
        if (vm.transaction.type === TransactionType.buy) {
            // Update current average price on every buy transaction
            currentAveragePrice = (currentAveragePrice * previousSharesLeft + vm.price * vm.shares) / (previousSharesLeft + vm.shares);
            vm.averagePrice = currentAveragePrice;
        } else if (vm.sharesLeft <= 0) {
            // If shares left is 0, then average price is also 0
            currentAveragePrice = 0;
            vm.averagePrice = currentAveragePrice;
        } else {
            // On sell transactions, average price doesn't change from the previous transaction
            vm.averagePrice = currentAveragePrice;
        }

        return currentAveragePrice;
    }

    calculateAccumulatedBrokerage(vm: TransactionViewModel, previousVm: TransactionViewModel | null) {
        if (previousVm === null) {
            vm.accumulatedBrokerage = vm.brokerage;
        } else if (vm.transaction.type === TransactionType.buy && previousVm.transaction.type === TransactionType.sell) {
            // Restart accumulated brokerage after a sell
            vm.accumulatedBrokerage = vm.brokerage;
        } else if (vm.transaction.type === TransactionType.sell && previousVm.transaction.type === TransactionType.sell) {
            vm.accumulatedBrokerage = vm.brokerage;
        } else {
            vm.accumulatedBrokerage = vm.brokerage + previousVm.accumulatedBrokerage;
        }
    }

    calculateUnrealizedWin(vm: TransactionViewModel, priceList: IPriceList, transactionsAfter: TransactionViewModel[]) {
        if (vm.transaction.type === TransactionType.buy && vm.shares > 0) {
            const lastPriceDate = this.findLastPriceDateForUnrealizedWin(vm.transaction.date, transactionsAfter);
            const currentPrice: number = this._priceListService.getPriceClosestToDate(lastPriceDate, priceList);
            vm.unrealizedWin = (vm.shares * currentPrice) - (vm.shares * vm.price + vm.brokerage);
        } else {
            vm.unrealizedWin = undefined;
        }
    }

    findLastPriceDateForUnrealizedWin(currentTransactionDate: number, transactionsAfter: TransactionViewModel[]): number {
        // When all shares after the current transaction is sold, we take the date of the last selling transaction
        if (transactionsAfter && transactionsAfter.length > 0) {
            transactionsAfter.forEach((vm, index) => {
                if (vm.sharesLeft <= 0) {
                    return vm.transaction.date;
                }
            });
        }

        // When shares aren't sold, we take today's date
        return new Date().getTime();
    }
}