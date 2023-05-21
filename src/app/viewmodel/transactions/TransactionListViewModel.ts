import TransactionViewModel from "./TransactionViewModel";

export default class TransactionListViewModel {
    constructor(private _transactionViewModels: TransactionViewModel[]) { }

    get TransactionViewModels(): TransactionViewModel[] {
        return this._transactionViewModels;
    }
}