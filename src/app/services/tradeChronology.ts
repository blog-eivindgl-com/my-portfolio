import { ITransaction } from '../database/types/types';

// Wall-clock labels, not instants: do not parse them through the device timezone.
export function orderTransactions(input: readonly ITransaction[]) {
    const groups = new Map<string, ITransaction[]>();
    for (const row of input) {
        const key = JSON.stringify([row.accountId, row.ticker, row.date]);
        const group = groups.get(key) || [];
        group.push(row);
        groups.set(key, group);
    }
    const warnings: string[] = [];
    for (const rows of Array.from(groups.values())) {
        if (rows.length < 2) continue;
        const times = rows.map(row => row.tradeTime);
        if (times.some(time => !time) || new Set(times).size < times.length) {
            warnings.push(`${rows[0].accountId} / ${rows[0].ticker} on ${new Date(rows[0].date).toISOString().slice(0, 10)}: missing or equal trade times leave the order unknown.`);
        }
    }
    // Unknown times appear after supplied times for display only. Stable input order
    // breaks display ties, never UUID/device sequence as evidence of chronology.
    const transactions = [...input].sort((a, b) => a.date - b.date
        || (a.tradeTime || '99:99').localeCompare(b.tradeTime || '99:99'));
    return { transactions, warnings };
}
