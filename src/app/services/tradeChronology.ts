import { ITransaction } from '../database/types/types';
const groupKey = (row: ITransaction) => JSON.stringify([row.accountId, row.instrumentId, row.date]);
// Explicit historical domain order and clock labels are independent of device sequence.
export function orderTransactions(input: readonly ITransaction[]) {
    const groups = new Map<string, ITransaction[]>();
    for (const row of input) { const key = groupKey(row), group = groups.get(key) || []; group.push(row); groups.set(key, group); }
    const warnings: string[] = [], ordered = new Map<string, ITransaction[]>();
    for (const [key, rows] of Array.from(groups.entries())) {
        if (rows.length < 2) continue;
        const times = rows.map(row => row.tradeTime), orders = rows.map(row => row.tradeOrder);
        const knownTime = times.every(time => !!time) && new Set(times).size === times.length;
        const knownOrder = orders.every(order => order !== undefined) && new Set(orders).size === orders.length;
        const byOrder = knownOrder ? [...rows].sort((a, b) => a.tradeOrder! - b.tradeOrder!) : [];
        const contradictory = knownOrder && knownTime && byOrder.some((row, index) => index > 0 && row.tradeTime! < byOrder[index - 1].tradeTime!);
        if ((!knownOrder && !knownTime) || contradictory) warnings.push(`${rows[0].accountId} / ${rows[0].instrumentId} on ${new Date(rows[0].date).toISOString().slice(0, 10)}: missing, equal or contradictory trade order/time requires review.`);
        if (knownOrder) ordered.set(key, byOrder);
    }
    const transactions = [...input].sort((a, b) => a.date - b.date || (a.tradeTime || '99:99').localeCompare(b.tradeTime || '99:99'));
    // Replace only each group's display slots, preserving the existing inter-group
    // ordering without a nontransitive comparator mixing time and ordinal evidence.
    const offsets = new Map<string, number>();
    return { transactions: transactions.map(row => { const key = groupKey(row), rows = ordered.get(key); if (!rows) return row; const offset = offsets.get(key) || 0; offsets.set(key, offset + 1); return rows[offset]; }), warnings };
}
