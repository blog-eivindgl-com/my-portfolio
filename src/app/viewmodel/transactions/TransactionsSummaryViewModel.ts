export default class TransactionsSummaryViewModel {
    constructor() {}
    _currentUnrealizedWin: number | undefined;
    get currentUnrealizedWin(): number | undefined {
        return this._currentUnrealizedWin;
    }
    set currentUnrealizedWin(value: number | undefined) {
        this._currentUnrealizedWin = value;
    }

    _totalRealizedWin: number | undefined;
    get totalRealizedWin(): number {
        return this._totalRealizedWin || 0;
    }
    set totalRealizedWin(value: number | undefined) {
        this._totalRealizedWin = value;
    }

    _currentInvestment: number | undefined;
    get currentInvestment(): number | undefined {
        return this._currentInvestment;
    }
    set currentInvestment(value: number | undefined) {
        this._currentInvestment = value;
    }

    _currentSharesLeft: number | undefined;
    get currentSharesLeft(): number | undefined {
        return this._currentSharesLeft;
    }
    set currentSharesLeft(value: number | undefined) {
        this._currentSharesLeft = value;
    }

    _currentUnrelaizedWin: number | undefined;
    get currentUnrelaizedWin(): number {
        return this._currentUnrelaizedWin || 0;
    }
    set currentUnrelaizedWin(value: number | undefined) {
        this._currentUnrelaizedWin = value;
    }

    _currentPrice: number | undefined;
    get currentPrice(): number | undefined {
        return this._currentPrice;
    }
    set currentPrice(value: number | undefined) {
        this._currentPrice = value;
    }

    _currentPriceUpdated: number | undefined;
    get currentPriceUpdated(): number | undefined {
        return this._currentPriceUpdated;
    }
    set currentPriceUpdated(value: number | undefined) {
        this._currentPriceUpdated = value;
    }

    get currentPriceUpdateString(): string | undefined {
        if (this._currentPriceUpdated) {
            const date = new Date(this._currentPriceUpdated);
            return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        }
        return undefined;
    }
}