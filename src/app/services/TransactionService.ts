import { orderTransactions } from './tradeChronology';
import { IPriceList, ITransaction, TransactionType } from "../database/types/types";
import TransactionListViewModel from "../viewmodel/transactions/TransactionListViewModel";
import TransactionViewModel from "../viewmodel/transactions/TransactionViewModel";
import TransactionsSummaryViewModel from "../viewmodel/transactions/TransactionsSummaryViewModel";
import PriceListService from "./PriceListService";

export default class TransactionService {
    constructor(private _priceListService: PriceListService) {}

    getTransactionListViewModel(transactions: ITransaction[] | undefined, priceList: IPriceList | undefined): TransactionListViewModel {
        if (transactions === undefined) {
            return new TransactionListViewModel([]);
        }

        const ordered = orderTransactions(transactions);
        const tlvm = new TransactionListViewModel(ordered.transactions.map(t => new TransactionViewModel(t)), ordered.warnings);
        // Display ordering must never become assumed accounting chronology.
        if (ordered.warnings.length) return tlvm;

        // Calculate values not dependent on future transactions
        const positions = new Map<string, TransactionViewModel>();
        tlvm.TransactionViewModels.forEach(vm => {
            const key = JSON.stringify([vm.transaction.accountId, vm.transaction.instrumentId]);
            const previousVm = positions.get(key) || null;
            const previousSharesLeft = previousVm?.sharesLeft || 0;

            // Calculate shares left
            this.calculsateSharesLeft(vm, previousSharesLeft);

            // Calculate average price on each buy
            this.calculateAveragePrice(vm, previousVm?.averagePrice || 0, previousSharesLeft);

            // Calculate accumulated brokerage on each buy and first sale
            this.calculateAccumulatedBrokerage(vm, previousVm);

            // Calculate realized win/loss
            this.calculateRealizedWin(vm, previousVm);
            positions.set(key, vm);
        });

        // Calculate values that depends on values of other transactions coming after in the list
        tlvm.TransactionViewModels.forEach((vm, index, all) => {
            this.calculateUnrealizedWin(vm, priceList?.instrumentId === vm.transaction.instrumentId ? priceList : undefined,
                all.slice(index).filter(row => row.transaction.accountId === vm.transaction.accountId && row.transaction.instrumentId === vm.transaction.instrumentId));
        });
        return tlvm;
    }

    calculsateSharesLeft(vm: TransactionViewModel, currentSharesLeft: number): number {
        if (vm.transaction.type === TransactionType.buy) {
            currentSharesLeft += vm.shares;
            vm.sharesLeft = currentSharesLeft;
        } else {
            currentSharesLeft += vm.shares;
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

    calculateUnrealizedWin(vm: TransactionViewModel, priceList: IPriceList | undefined, transactionsAfter: TransactionViewModel[]) {
        if (vm.transaction.type === TransactionType.buy && vm.shares > 0) {
            const lastPriceDate = this.findLastPriceDateForUnrealizedWin(vm.transaction.date, transactionsAfter);

            if (priceList === undefined) {
                priceList = {
                    instrumentId: vm.transaction.instrumentId
                };
            }
            const currentPrice = this._priceListService.getPriceClosestToDate(lastPriceDate, priceList);
            vm.unrealizedWin = currentPrice === undefined ? undefined : (vm.shares * currentPrice) - (vm.shares * vm.price + vm.brokerage);
        } else {
            vm.unrealizedWin = undefined;
        }
    }

    calculateRealizedWin(vm: TransactionViewModel, previousVm: TransactionViewModel | null) {
        if (vm.transaction.type === TransactionType.sell && Math.abs(vm.shares) > 0) {
            vm.realizedWin = (Math.abs(vm.shares) * vm.price) 
            - ((previousVm?.sharesLeft || 0) * (previousVm?.averagePrice || 0)) 
            + (vm.sharesLeft * vm.averagePrice) 
            - vm.accumulatedBrokerage; 
        } else {
            vm.realizedWin = undefined;
        }
    }

    findLastPriceDateForUnrealizedWin(currentTransactionDate: number, transactionsAfter: TransactionViewModel[]): number {
        // When all shares after the current transaction is sold, we take the date of the last selling transaction
        if (transactionsAfter && transactionsAfter.length > 0) {
            const closing = transactionsAfter.find(vm => vm.transaction.date >= currentTransactionDate && vm.sharesLeft <= 0);
            if (closing) return closing.transaction.date;
        }

        // When shares aren't sold, we take today's date
        return new Date().getTime();
    }

    getTransactionsSummaryViewModel(transactionListViewModel: TransactionListViewModel, priceList: IPriceList | undefined): TransactionsSummaryViewModel {
        const summaryVm = new TransactionsSummaryViewModel();
        if (transactionListViewModel.orderWarnings.length) {
            summaryVm.totalRealizedWin = undefined;
            summaryVm.orderWarning = 'Calculations are unavailable because same-day trade order is unknown. Supply distinct trade times where known; equal times still need review.';
            return summaryVm;
        }
        const rows = transactionListViewModel.TransactionViewModels;
        const instrumentIds = new Set(rows.map(row => row.transaction.instrumentId));
        if (instrumentIds.size > 1) {
            summaryVm.totalRealizedWin = undefined;
            summaryVm.incompleteReason = 'Mixed instruments cannot share one price or monetary summary. View each instrument separately.';
            return summaryVm;
        }

        // Calculate total realized win
        summaryVm.totalRealizedWin = 
            transactionListViewModel.TransactionViewModels
            .filter(t => t.realizedWin !== undefined)
            .reduce((sum, current) => sum += (current.realizedWin || 0), 0);

        // Calculate current investment
        const lastTransaction = 
            transactionListViewModel.TransactionViewModels
            .at(transactionListViewModel.TransactionViewModels.length - 1);
        const positions = new Map<string, TransactionViewModel>();
        rows.forEach(row => positions.set(JSON.stringify([row.transaction.accountId, row.transaction.instrumentId]), row));
        summaryVm.currentInvestment = Array.from(positions.values()).reduce((sum, row) => sum + row.averagePrice * row.sharesLeft, 0);
        
        // Current shares left
        summaryVm.currentSharesLeft = Array.from(positions.values()).reduce((sum, row) => sum + row.sharesLeft, 0);

        // Current price
        if (priceList === undefined || (lastTransaction && priceList.instrumentId !== lastTransaction.transaction.instrumentId)) {
            priceList = {
                instrumentId: lastTransaction?.transaction.instrumentId || ""
            };
        }
        const currentPrice = this._priceListService.getPriceAndDateClosestToDate(Date.now(), priceList);
        summaryVm.currentPriceUpdated = currentPrice?.date;
        summaryVm.currentPrice = currentPrice?.price;
        summaryVm.currentPriceSource = currentPrice?.source;
        summaryVm.currentPriceAgeDays = currentPrice ? Math.floor(currentPrice.ageMilliseconds / 86_400_000) : undefined;

        // Current unrealized win
        if (summaryVm.currentSharesLeft > 0 && summaryVm.currentPrice !== undefined) {
            summaryVm.currentUnrealizedWin = (summaryVm.currentPrice * summaryVm.currentSharesLeft) - summaryVm.currentInvestment;
        }

        return summaryVm;
    }
}
