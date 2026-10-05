import Decimal from 'decimal.js';
import { orderTransactions } from './tradeChronology';
import { IAccount, IStock, IStockPrice, ITransaction, TransactionType } from '../database/types/types';
import { parseTradeDate, validateTransaction } from './transactionValidation';

// Account-isolated weighted-average trade cost and fees charged at each sale. No global Decimal settings, database writes or clock reads.
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const CALCULATION_POLICY = 'fees-at-each-sale-v1';
export interface PortfolioInput {
    accounts: readonly IAccount[];
    instruments: readonly IStock[];
    transactions: readonly ITransaction[];
    stockPrices: readonly IStockPrice[];
}
export interface PortfolioIssue { code: string; message: string; transactionId?: string }
export interface PortfolioQuote {
    status: 'fresh' | 'stale' | 'missing' | 'conflicting';
    price: string | null;
    date: number | null;
    ids: string[];
    ageMilliseconds: number | null;
    ignoredInvalid: number;
    ignoredFuture: number;
}
export interface PortfolioLedgerRow {
    id: string; date: number | null; tradeTime: string | null; tradeOrder: number | null; type: number | null; description: string;
    quantity: string | null; price: string | null; fee: string | null;
    status: 'applied' | 'future' | 'blocked';
    quantityAfter: string | null; costAfter: string | null; averageCostAfter: string | null;
    accumulatedFees: string | null; pendingFeesAfter: string | null;
    releasedCost: string | null; deductedBuyFee: string | null;
    netProceeds: string | null; realizedGain: string | null;
}
export interface PortfolioPosition {
    accountId: string; instrumentId: string;
    status: 'open' | 'closed' | 'invalid';
    quantity: string | null; remainingCost: string | null; averageCost: string | null;
    realizedGain: string | null; unrealizedGain: string | null; marketValue: string | null;
    buyFees: string | null; deductedBuyFees: string | null; pendingBuyFees: string | null;
    sellFees: string | null; netCashFlow: string | null;
    quote: PortfolioQuote; issues: PortfolioIssue[]; ledger: PortfolioLedgerRow[];
}
export interface PortfolioTotal {
    instrumentId: string; status: 'complete' | 'stale' | 'incomplete';
    quantity: string | null; remainingCost: string | null; realizedGain: string | null;
    unrealizedGain: string | null; marketValue: string | null;
}
export interface PortfolioReport {
    policy: typeof CALCULATION_POLICY; asOf: number; staleAfterDays: number;
    positions: PortfolioPosition[]; instruments: PortfolioTotal[]; issues: PortfolioIssue[];
    futureTransactions: number;
}

const numeric = (value: unknown): string | null => typeof value === 'number' && Number.isFinite(value) ? new D(String(value)).toString() : null;
const validDate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime());
const identity = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function selectPortfolioQuote(instrumentId: string, quotes: readonly IStockPrice[], asOf: number, staleAfterDays: number): PortfolioQuote {
    if (!validDate(asOf) || !Number.isInteger(staleAfterDays) || staleAfterDays < 0 || staleAfterDays > 3650) throw new Error('Invalid quote valuation options.');
    const result: PortfolioQuote = { status: 'missing', price: null, date: null, ids: [], ageMilliseconds: null, ignoredInvalid: 0, ignoredFuture: 0 };
    const eligible: IStockPrice[] = [];
    for (const quote of quotes) {
        if (!quote || quote.instrumentId !== instrumentId) continue;
        if (!identity(quote.id) || !validDate(quote.date) || typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0) { result.ignoredInvalid++; continue; }
        if (quote.date > asOf) { result.ignoredFuture++; continue; }
        eligible.push(quote);
    }
    if (!eligible.length) return result;
    const latest = eligible.reduce((date, row) => Math.max(date, row.date), -Infinity);
    const candidates = eligible.filter(row => row.date === latest).sort((a, b) => compareText(a.id, b.id));
    result.date = latest;
    result.ageMilliseconds = asOf - latest;
    result.ids = candidates.map(row => row.id);
    if (candidates.some(row => row.price !== candidates[0].price)) { result.status = 'conflicting'; return result; }
    result.price = new D(String(candidates[0].price)).toString();
    result.status = result.ageMilliseconds > staleAfterDays * 86_400_000 ? 'stale' : 'fresh';
    return result;
}

export function calculatePortfolio(input: PortfolioInput, options: { asOf: number; staleAfterDays?: number }): PortfolioReport {
    const { asOf } = options;
    const staleAfterDays = options.staleAfterDays ?? 7;
    if (!validDate(asOf) || !Number.isInteger(staleAfterDays) || staleAfterDays < 0 || staleAfterDays > 3650) throw new Error('Choose a valid valuation time and a stale threshold of 0–3650 whole days.');
    const accountIds = new Set(input.accounts.map(row => row.id));
    const instrumentIds = new Set(input.instruments.map(row => row.id));
    const duplicateIds = new Set<string>();
    const seen = new Set<string>();
    for (const row of input.transactions) {
        if (row && seen.has(row.id)) duplicateIds.add(row.id);
        if (row) seen.add(row.id);
    }
    const issues: PortfolioIssue[] = [];
    const groups = new Map<string, ITransaction[]>();
    for (const row of input.transactions) {
        if (!row || !identity(row.accountId) || !identity(row.instrumentId)) {
            issues.push({ code: 'identity', message: 'A transaction has no usable account/instrument identity. Its amounts are excluded; this report is incomplete.' });
            continue;
        }
        const key = JSON.stringify([row.accountId, row.instrumentId]);
        const group = groups.get(key) || [];
        group.push(row); groups.set(key, group);
    }
    let futureTransactions = 0;
    const positions: PortfolioPosition[] = [];
    for (const key of Array.from(groups.keys()).sort(compareText)) {
        const transactions = [...groups.get(key)!].sort((a, b) => {
            const dateOrder = (validDate(a.date) ? a.date : 0) - (validDate(b.date) ? b.date : 0);
            return dateOrder || compareText(String(a.id), String(b.id));
        });
        const { accountId, instrumentId } = transactions[0];
        const position: PortfolioPosition = {
            accountId, instrumentId, status: 'invalid', quantity: null, remainingCost: null, averageCost: null,
            realizedGain: null, unrealizedGain: null, marketValue: null,
            buyFees: null, deductedBuyFees: null, pendingBuyFees: null, sellFees: null, netCashFlow: null,
            quote: selectPortfolioQuote(instrumentId, input.stockPrices, asOf, staleAfterDays), issues: [], ledger: [],
        };
        const applied: Array<{ transaction: ITransaction; row: PortfolioLedgerRow }> = [];
        for (const transaction of transactions) {
            const future = validDate(transaction.date) && transaction.date > asOf;
            const row: PortfolioLedgerRow = {
                id: String(transaction.id), date: validDate(transaction.date) ? transaction.date : null,
                tradeTime: transaction.tradeTime ?? null, tradeOrder: transaction.tradeOrder ?? null,
                type: transaction.type === 0 || transaction.type === 1 ? transaction.type : null,
                description: typeof transaction.description === 'string' ? transaction.description : '',
                quantity: numeric(transaction.shares), price: numeric(transaction.price), fee: numeric(transaction.brokerage),
                status: future ? 'future' : 'blocked', quantityAfter: null, costAfter: null, averageCostAfter: null, accumulatedFees: null, pendingFeesAfter: null,
                releasedCost: null, deductedBuyFee: null, netProceeds: null, realizedGain: null,
            };
            position.ledger.push(row);
            if (future) { futureTransactions++; continue; }
            try { validateTransaction(transaction); }
            catch { position.issues.push({ code: 'invalid-record', transactionId: row.id, message: 'Invalid transaction fields or date. Stored data was not repaired.' }); continue; }
            if (!accountIds.has(accountId) || !instrumentIds.has(instrumentId)) position.issues.push({ code: 'reference', transactionId: row.id, message: 'Account or instrument reference is missing.' });
            if (duplicateIds.has(transaction.id)) position.issues.push({ code: 'duplicate', transactionId: row.id, message: 'Duplicate transaction identity.' });
            applied.push({ transaction, row });
        }
        // Only validated, included records can supply chronology. UUID ordering above
        // is deterministic display order only, never evidence for a calculation.
        const chronology = orderTransactions(applied.map(item => item.transaction));
        for (const message of chronology.warnings) position.issues.push({ code: 'same-day-order', message });
        const order = new Map(chronology.transactions.map((transaction, index) => [transaction, index]));
        applied.sort((a, b) => order.get(a.transaction)! - order.get(b.transaction)!);
        const includedRows = new Set(applied.map(item => item.row));
        position.ledger = [...applied.map(item => item.row), ...position.ledger.filter(row => !includedRows.has(row))];
        let units = new D(0), cost = new D(0), realized = new D(0), buyFees = new D(0), feePool = new D(0), deductedFees = new D(0), sellFees = new D(0), cash = new D(0);
        if (!position.issues.length) for (const { transaction, row } of applied) {
            const quantity = new D(String(transaction.shares)), price = new D(String(transaction.price)), fee = new D(String(transaction.brokerage));
            if (transaction.type === TransactionType.buy) {
                const paid = quantity.mul(price).plus(fee);
                units = units.plus(quantity); cost = cost.plus(quantity.mul(price)); cash = cash.minus(paid);
                buyFees = buyFees.plus(fee); feePool = feePool.plus(fee);
            } else {
                if (quantity.gt(units)) {
                    position.issues.push({ code: 'oversell', transactionId: row.id, message: 'Sale exceeds available units in this account/instrument. This long-only calculation does not infer a short position.' });
                    break;
                }
                const all = quantity.eq(units);
                const released = all ? cost : cost.mul(quantity).div(units);
                const deducted = feePool;
                row.accumulatedFees = feePool.plus(fee).toString();
                const proceeds = quantity.mul(price).minus(fee);
                const gain = proceeds.minus(released).minus(deducted);
                units = units.minus(quantity); cost = cost.minus(released); feePool = feePool.minus(deducted);
                realized = realized.plus(gain); cash = cash.plus(proceeds);
                deductedFees = deductedFees.plus(deducted); sellFees = sellFees.plus(fee);
                row.releasedCost = released.toString(); row.deductedBuyFee = deducted.toString();
                row.netProceeds = proceeds.toString(); row.realizedGain = gain.toString();
            }
            row.accumulatedFees ??= feePool.toString();
            row.pendingFeesAfter = feePool.toString();
            row.averageCostAfter = units.isZero() ? '0' : cost.div(units).toString();
            row.status = 'applied'; row.quantityAfter = units.toString(); row.costAfter = cost.toString();
        }
        if (position.issues.length) {
            // Never present a valid-looking partial ledger or subtotal after an unsupported event.
            for (const row of position.ledger) if (row.status !== 'future') {
                row.status = 'blocked'; row.quantityAfter = row.costAfter = row.averageCostAfter = row.accumulatedFees = row.pendingFeesAfter = row.releasedCost = row.deductedBuyFee = row.netProceeds = row.realizedGain = null;
            }
        } else {
            position.status = units.isZero() ? 'closed' : 'open';
            position.quantity = units.toString(); position.remainingCost = cost.toString();
            position.averageCost = units.isZero() ? '0' : cost.div(units).toString();
            position.realizedGain = realized.toString(); position.buyFees = buyFees.toString();
            position.pendingBuyFees = feePool.toString(); position.deductedBuyFees = deductedFees.toString();
            position.sellFees = sellFees.toString(); position.netCashFlow = cash.toString();
            if (units.isZero()) { position.marketValue = '0'; position.unrealizedGain = '0'; }
            else if (position.quote.price !== null) {
                const market = units.mul(position.quote.price);
                position.marketValue = market.toString(); position.unrealizedGain = market.minus(cost).toString();
            }
        }
        positions.push(position);
    }
    const instruments: PortfolioTotal[] = Array.from(new Set(positions.map(row => row.instrumentId))).sort(compareText).map(instrumentId => {
        const rows = positions.filter(row => row.instrumentId === instrumentId);
        const sum = (field: 'quantity' | 'remainingCost' | 'realizedGain' | 'unrealizedGain' | 'marketValue'): string | null =>
            issues.length || rows.some(row => row[field] === null) ? null : rows.reduce((total, row) => total.plus(row[field]!), new D(0)).toString();
        const incomplete = issues.length > 0 || rows.some(row => row.status === 'invalid' || row.marketValue === null);
        const stale = rows.some(row => row.status === 'open' && row.quote.status === 'stale');
        return { instrumentId, status: incomplete ? 'incomplete' : stale ? 'stale' : 'complete', quantity: sum('quantity'), remainingCost: sum('remainingCost'), realizedGain: sum('realizedGain'), unrealizedGain: sum('unrealizedGain'), marketValue: sum('marketValue') };
    });
    return { policy: CALCULATION_POLICY, asOf, staleAfterDays, positions, instruments, issues, futureTransactions };
}

export function formatMoney(value: string | null): string {
    return value === null ? 'Unknown' : new D(value).toFixed(2, Decimal.ROUND_HALF_UP);
}

export function parseValuationTime(value: string): number {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match) return NaN;
    const day = parseTradeDate(match[1]), hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4] || 0);
    return Number.isFinite(day) && hour < 24 && minute < 60 && second < 60 ? day + (hour * 3600 + minute * 60 + second) * 1000 : NaN;
}
