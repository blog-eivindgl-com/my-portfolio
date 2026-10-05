import Decimal from 'decimal.js';
import { ITransaction } from '../database/types/types';
import { PortfolioIssue, PortfolioPosition } from './portfolioCalculations';
import { orderTransactions } from './tradeChronology';
import TransactionViewModel from '../viewmodel/transactions/TransactionViewModel';
import TransactionListViewModel from '../viewmodel/transactions/TransactionListViewModel';
import TransactionsSummaryViewModel from '../viewmodel/transactions/TransactionsSummaryViewModel';

// Formatting boundary only: all cost, fee and aggregate arithmetic stays decimal.
const number = (value: string | null): number | undefined => value !== null && Number.isFinite(Number(value)) ? Number(value) : undefined;
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function portfolioViewModels(positions: readonly PortfolioPosition[], transactions: readonly ITransaction[], issues: readonly PortfolioIssue[] = []) {
    const records = new Map(transactions.map(row => [row.id, row]));
    const rows = new Map<string, TransactionViewModel>();
    for (const position of positions) {
        const last = position.ledger.filter(row => row.status === 'applied').at(-1);
        for (const row of position.ledger) {
            const transaction = records.get(row.id);
            if (!transaction) continue;
            const vm = new TransactionViewModel(transaction);
            vm.calculationUnavailable = row.status !== 'applied' || [row.averageCostAfter, row.quantityAfter, row.costAfter, row.accumulatedFees].some(value => value !== null && number(value) === undefined);
            vm.calculationStatus = row.status === 'future' ? 'Excluded: future date' : vm.calculationUnavailable ? 'Calculation unavailable' : 'Included';
            vm.averagePrice = number(row.averageCostAfter) ?? 0;
            vm.sharesLeft = number(row.quantityAfter) ?? 0;
            vm.worth = number(row.costAfter) ?? 0;
            vm.accumulatedBrokerage = number(row.accumulatedFees) ?? 0;
            vm.realizedWin = number(row.realizedGain);
            vm.unrealizedWin = row === last ? number(position.unrealizedGain) : undefined;
            rows.set(row.id, vm);
        }
    }
    const warnings = positions.flatMap(position => position.issues.filter(issue => issue.code === 'same-day-order').map(issue => issue.message));
    const list = new TransactionListViewModel(orderTransactions(transactions).transactions.map(row => rows.get(row.id)).filter((row): row is TransactionViewModel => !!row), warnings);
    const summary = new TransactionsSummaryViewModel();
    const sum = (key: 'quantity' | 'remainingCost' | 'realizedGain' | 'unrealizedGain' | 'pendingBuyFees') => {
        if (issues.length || positions.some(position => position[key] === null)) return undefined;
        return number(positions.reduce((total, position) => total.plus(position[key]!), new D(0)).toString());
    };
    summary.currentSharesLeft = sum('quantity');
    summary.currentInvestment = sum('remainingCost');
    summary.totalRealizedWin = sum('realizedGain');
    summary.currentUnrealizedWin = sum('unrealizedGain');
    summary.pendingFees = sum('pendingBuyFees');
    if (warnings.length) summary.orderWarning = 'Calculations are unavailable because same-day trade order is unknown or contradictory. Supply distinct trade times where known; equal times still need review.';
    const otherIssues = [...issues.map(issue => issue.message), ...positions.flatMap(position => position.issues.filter(issue => issue.code !== 'same-day-order').map(issue => issue.message))];
    if (otherIssues.length) summary.incompleteReason = Array.from(new Set(otherIssues)).join(' ');
    const quote = positions[0]?.quote;
    if (quote) {
        summary.currentPrice = number(quote.price);
        summary.currentPriceUpdated = quote.date ?? undefined;
        summary.currentPriceSource = 'quote';
        summary.currentPriceAgeDays = quote.ageMilliseconds === null ? undefined : Math.floor(quote.ageMilliseconds / 86_400_000);
        summary.valuationNote = quote.price === null
            ? `Valuation: ${quote.status}. Market value and unrealized gain are unknown for open positions. Transaction prices are not substituted for market quotes.`
            : `Recorded quote ${quote.price}, ${summary.currentPriceAgeDays} days old. Valuation: ${quote.status}.${quote.status === 'stale' ? ' Displayed market values are stale estimates.' : ''} Source IDs: ${quote.ids.join(', ')}.`;
    }
    return { list, summary };
}
