import TransactionViewModel from "./TransactionViewModel";

export default class TransactionListViewModel {
    constructor(private _transactionViewModels: TransactionViewModel[], public readonly orderWarnings: string[] = []) { }

    get TransactionViewModels(): TransactionViewModel[] {
        return this._transactionViewModels;
    }
}