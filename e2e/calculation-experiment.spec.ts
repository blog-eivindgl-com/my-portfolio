import { expect, Page, test } from '@playwright/test';
import { ITransaction, IStockPrice } from '../src/app/database/types/types';
import { instrumentId, otherInstrumentId, instruments, restoreExperiment } from './helpers/experiment-fixture';

const date = (day: number) => Date.UTC(2023, 0, day);
const buy: ITransaction = { id: 'buy', accountId: 'A', instrumentId, date: date(1), type: 0, shares: 10, price: 100, brokerage: 10, description: 'Synthetic buy' };
const sale = { ...buy, id: 'sale', date: date(2), type: 1, shares: 4, price: 120, brokerage: 2, description: 'Synthetic sale' };
const quote: IStockPrice = { id: 'quote', instrumentId, date: date(3), price: 100 };

async function seed(page: Page, transactions = [buy, sale], quotes = [quote]) {
    await page.clock.setFixedTime(new Date('2023-01-04T12:00:00Z'));
    await restoreExperiment(page, transactions, quotes);
    await page.goto('/experiment');
    await expect(page.getByRole('region', { name: `A / ${instrumentId}`, exact: true })).toBeVisible();
}

async function snapshot(page: Page) {
    return page.evaluate(() => new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio');
        open.onsuccess = () => {
            const db = open.result;
            const tables = ['accounts', 'instruments', 'transactions', 'stockPrices', 'localState', 'entityStates', 'outbox', 'operationDigests'];
            const tx = db.transaction(tables, 'readonly');
            const result: Record<string, unknown[]> = {};
            for (const name of tables) { const get = tx.objectStore(name).getAll(); get.onsuccess = () => { result[name] = get.result; }; }
            tx.oncomplete = () => { db.close(); resolve(JSON.stringify(result)); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }));
}

const position = (page: Page, name = `A / ${instrumentId}`) => page.getByRole('region', { name, exact: true });
async function metric(page: Page, name: string, value: string, region = `A / ${instrumentId}`) {
    await expect(position(page, region).getByRole('group', { name, exact: true }).getByText(value, { exact: true })).toBeVisible();
}

test('clearly labels the unaccepted trial and reconciles 74 realized, 606 cost and -6 unrealized without writes', async ({ page }) => {
    await seed(page);
    const before = await snapshot(page);
    await expect(page.getByText('Trial policy — awaiting your decision.', { exact: true })).toBeVisible();
    await metric(page, 'Realized gain', '74.00');
    await metric(page, 'Remaining cost', '606.00');
    await metric(page, 'Unrealized gain', '-6.00');
    await metric(page, 'Purchase fees allocated to sales', '4.00');
    await metric(page, 'Purchase fees remaining in cost', '6.00');
    await expect(page.getByRole('region', { name: 'Worked fee example' })).toContainText('−1010 + 478 + 600 = 68');
    await position(page).getByText('Trial ledger and excluded records', { exact: true }).click();
    await expect(page.getByRole('table', { name: `Trial ledger A ${instrumentId}` })).toContainText('404.00');
    expect(await snapshot(page)).toBe(before);
});

test('historical cutoff excludes later trades/quotes while keeping those records visible', async ({ page }) => {
    await seed(page);
    const before = await snapshot(page);
    await page.getByLabel('Valuation time (UTC)').fill('2023-01-01T23:59:59');
    await metric(page, 'Units', '10');
    await metric(page, 'Remaining cost', '1010.00');
    await metric(page, 'Realized gain', '0.00');
    await metric(page, 'Market value', 'Unknown');
    await expect(page.getByText(/1 future transactions excluded/)).toBeVisible();
    await position(page).getByText('Trial ledger and excluded records', { exact: true }).click();
    await expect(page.getByRole('table', { name: `Trial ledger A ${instrumentId}` })).toContainText('future');
    await page.getByLabel('Valuation time (UTC)').fill('');
    await expect(page.locator('main').getByRole('alert')).toContainText('valid UTC timestamp');
    expect(await snapshot(page)).toBe(before);
});

test('overselling is visible and incomplete without rewriting the ledger', async ({ page }) => {
    await seed(page, [buy, { ...sale, shares: 11 }]);
    const before = await snapshot(page);
    await expect(position(page).getByRole('alert')).toContainText('Sale exceeds available units');
    await metric(page, 'Realized gain', 'Unknown');
    await expect(page.getByRole('table', { name: 'Trial instrument totals' })).toContainText('incomplete');
    await expect(page.locator('main')).not.toContainText('NaN');
    expect(await snapshot(page)).toBe(before);
});

test('mixed same-day buy/sell order is blocked instead of guessed from IDs', async ({ page }) => {
    await seed(page, [buy, { ...sale, date: buy.date }]);
    await expect(position(page).getByRole('alert')).toContainText('requires review');
    await metric(page, 'Remaining cost', 'Unknown');
});

test('missing quotes remain unknown despite an available transaction price', async ({ page }) => {
    await seed(page, [buy], []);
    await metric(page, 'Remaining cost', '1010.00');
    await metric(page, 'Market value', 'Unknown');
    await expect(position(page)).toContainText('Valuation: missing');
});

test('stale quote values are explicitly estimates and the threshold is an adjustable trial control', async ({ page }) => {
    await seed(page, [buy], [{ ...quote, date: date(1) }]);
    await page.getByLabel('Valuation time (UTC)').fill('2023-01-20T00:00');
    await expect(position(page)).toContainText('Displayed market values are stale estimates');
    await expect(page.getByRole('table', { name: 'Trial instrument totals' })).toContainText('stale');
    await page.getByLabel('Stale after (days)').fill('30');
    await expect(position(page)).toContainText('Valuation: fresh');
    await expect(position(page)).toContainText('Source IDs: quote');
});

test('conflicting latest quote values do not produce an arbitrary market value', async ({ page }) => {
    await seed(page, [buy], [quote, { ...quote, id: 'conflict', price: 101 }]);
    await metric(page, 'Market value', 'Unknown');
    await expect(position(page)).toContainText('Valuation: conflicting');
    await expect(position(page)).toContainText('Source IDs: conflict, quote');
});

test('account positions reconcile per instrument while different instruments have no combined currency total', async ({ page }) => {
    await seed(page, [
        { ...buy, brokerage: 0 }, { ...buy, id: 'b', accountId: 'B', price: 200, brokerage: 0 },
        { ...sale, shares: 10, brokerage: 0 }, { ...buy, id: 'other', instrumentId: otherInstrumentId, brokerage: 0 },
    ]);
    await metric(page, 'Realized gain', '200.00');
    await metric(page, 'Remaining cost', '2000.00', `B / ${instrumentId}`);
    await expect(page.getByRole('table', { name: 'Trial instrument totals' }).getByRole('row')).toHaveCount(3);
    await expect(page.getByText(/There is no FX conversion or cross-instrument money total/)).toBeVisible();
});

test('known retained order and wall times replay by UUID and remain read-only after restart', async ({ page }) => {
    await seed(page, [{ ...sale, id: 'a', date: buy.date, tradeOrder: 2, tradeTime: '14:00' }, { ...buy, id: 'z', tradeOrder: 1, tradeTime: '09:00' }]);
    const before = await snapshot(page);
    await metric(page, 'Realized gain', '74.00');
    await position(page).getByText('Trial ledger and excluded records', { exact: true }).click();
    const rows = page.getByRole('table', { name: `Trial ledger A ${instrumentId}` }).getByRole('row');
    await expect(rows.nth(1)).toContainText('09:00'); await expect(rows.nth(2)).toContainText('14:00');
    await page.reload(); await metric(page, 'Remaining cost', '606.00');
    expect(await snapshot(page)).toBe(before);
});

test('duplicate tickers and no ticker keep independent UUID positions, metadata and standard-view links', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2023-01-04T12:00:00Z'));
    const records = [buy, { ...buy, id: 'other', instrumentId: otherInstrumentId, price: 200, brokerage: 0 }];
    await restoreExperiment(page, records, [quote], instruments.map(row => ({ ...row, ticker: 'SAME' })));
    await page.goto('/experiment');
    await metric(page, 'Remaining cost', '1010.00');
    await metric(page, 'Remaining cost', '2000.00', `A / ${otherInstrumentId}`);
    await metric(page, 'Market value', 'Unknown', `A / ${otherInstrumentId}`);
    await position(page).getByRole('link', { name: /Open standard/ }).click();
    await expect(page).toHaveURL(new RegExp(instrumentId + '$'));
    await expect(page.getByRole('heading', { name: /Synthetic share/ })).toBeVisible();
    await restoreExperiment(page, records, [quote], instruments.map(row => ({ ...row, ticker: null })));
    await page.goto('/experiment');
    await metric(page, 'Remaining cost', '2000.00', `A / ${otherInstrumentId}`);
    await expect(position(page)).toContainText('Currency: Unknown');
});

test('live experiment follows rename, edit and delete from another tab without writing history', async ({ page, context }) => {
    await seed(page);
    const editor = await context.newPage();
    await editor.goto(`/stock/edit/${instrumentId}`);
    await editor.getByLabel('Instrument name', { exact: true }).fill('Renamed synthetic');
    await editor.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(editor.getByText('Name updated.', { exact: true })).toBeVisible();
    await expect(position(page).getByRole('heading')).toContainText('Renamed synthetic');
    await editor.goto(`/stock/transactions/${instrumentId}/edit/sale`);
    await editor.getByLabel('Quantity', { exact: true }).fill('5');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor.getByText('Transaction updated.', { exact: true })).toBeVisible();
    await metric(page, 'Remaining cost', '505.00'); await metric(page, 'Realized gain', '93.00');
    // A successful save intentionally locks the editor until the current revision is reloaded.
    await editor.reload();
    await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
    await editor.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(editor.getByText(/^Transaction deleted\./)).toBeVisible();
    await metric(page, 'Remaining cost', '1010.00'); await metric(page, 'Realized gain', '0.00');
    const after = await snapshot(page);
    expect(JSON.parse(after).entityStates.some((row: { recordKey: string; deleted: boolean }) => row.recordKey === 'sale' && row.deleted)).toBe(true);
    await page.reload(); await metric(page, 'Remaining cost', '1010.00');
    expect(await snapshot(page)).toBe(after);
    await editor.close();
});
