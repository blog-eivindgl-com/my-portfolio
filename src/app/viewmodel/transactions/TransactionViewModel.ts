import { ITransaction, TransactionType } from "@/app/database/types/types";

export default class TransactionViewModel {
    constructor(public transaction: ITransaction) {
        this.id = transaction.id;
        // Values below will be set by the map function based on the order of transactions
        this._averagePrice = transaction.price;
        this._sharesLeft = transaction.shares;
        this._worth = transaction.price * transaction.shares;  // Price will be replaced with current price up until shares are sold. Current price is registered every now and then.
        this._accumulatedBrokerage = this.brokerage;  // Will be accumulated until first sell after buy date
        this._unrealizedWin = undefined;  // Will be replaced with current price * shares up until shares are sold.
        this._realizedWin = undefined; // Will be replaced with actual win/loss when shares are sold
    }
    
    [key: string]: any

    get date(): string {
        return new Date(this.transaction.date).toLocaleDateString();
    }

    get description(): string {
        return this.transaction.description;
    }

    get buy(): number | undefined {
        if (this.transaction.type === TransactionType.buy) {
            return this.transaction.price * this.transaction.shares + this.transaction.brokerage;
        }
        return undefined;
    }

    get sell(): number | undefined {
        if (this.transaction.type === TransactionType.sell) {
            return this.transaction.price * this.transaction.shares;
        }
        return undefined;
    }

    get price(): number {
        return this.transaction.price;
    }

    get shares(): number {
        switch (this.transaction.type) {
            case TransactionType.sell:
                return this.transaction.shares * -1;
            default:
                return this.transaction.shares;
        }
    }

    get marketValuePerDate(): number {
        return this.sharesLeft * this.price;
    }

    get brokerage(): number {
        return this.transaction.brokerage;
    }

    // Below properties must be calculated by the map function
    _averagePrice: number;
    get averagePrice(): number {
        return this._averagePrice;
    }
    set averagePrice(value: number) {
        this._averagePrice = value;
    }

    _sharesLeft: number;
    get sharesLeft(): number {
        return this._sharesLeft;
    }
    set sharesLeft(value: number) {
        this._sharesLeft = value;
    }

    _worth: number;
    get worth(): number {
        return this._worth;
    }
    set worth(value: number) {
        this._worth = value;
    }

    _accumulatedBrokerage: number;
    get accumulatedBrokerage(): number {
        return this._accumulatedBrokerage;
    }
    set accumulatedBrokerage(value: number) {
        this._accumulatedBrokerage = value;
    }

    _unrealizedWin: number | undefined;
    get unrealizedWin(): number | undefined {
        return this._unrealizedWin;
    }
    set unrealizedWin(value: number | undefined) {
        this._unrealizedWin = value;
    }

    _realizedWin: number | undefined;
    get realizedWin(): number | undefined {
        return this._realizedWin;
    }
    set realizedWin(value: number | undefined) {
        this._realizedWin = value;
    }
}