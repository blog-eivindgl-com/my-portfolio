import { expect, Page, test } from '@playwright/test';
import { ITransaction, IStockPrice } from '../src/app/database/types/types';
import { instrumentId, otherInstrumentId, instruments, restorePortfolio } from './helpers/portfolio-fixture';
const date = (day: number) => Date.UTC(2023, 0, day);
const buy: ITransaction = { id: 'buy', accountId: 'A', instrumentId, date: date(1), type: 0, shares: 10, price: 100, brokerage: 10, description: 'Synthetic buy' };
const sale: ITransaction = { ...buy, id: 'sale', date: date(2), type: 1, shares: 4, price: 120, brokerage: 2, description: 'Synthetic sale' };
const quote: IStockPrice = { id: 'quote', instrumentId, date: date(3), price: 100 };
const route = '/stock/transactions/' + instrumentId;
async function seed(page: Page, transactions = [buy, sale], quotes = [quote]) {
    await page.clock.setFixedTime(new Date('2023-01-10T12:00:00Z'));
    await restorePortfolio(page, transactions, quotes);
    await page.goto(route); await expect(page.getByRole('tab', { name: 'Combined', exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function snapshot(page: Page) {
    return page.evaluate(() => new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio'); open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tables = ['accounts', 'instruments', 'transactions', 'stockPrices', 'localState', 'entityStates', 'outbox', 'operationDigests'];
            const tx = db.transaction(tables, 'readonly'), result: Record<string, unknown[]> = {};
            for (const name of tables) { const get = tx.objectStore(name).getAll(); get.onsuccess = () => { result[name] = get.result; }; }
            tx.oncomplete = () => { db.close(); resolve(JSON.stringify(result)); }; tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }));
}
const totals = (page: Page) => page.getByRole('region', { name: 'Instrument totals', exact: true });
async function metric(page: Page, name: string, value: string, account?: string) {
    const region = account ? page.getByRole('region', { name: `Account ${account}`, exact: true }) : totals(page);
    await expect(region.getByRole('group', { name, exact: true }).getByText(value, { exact: true })).toBeVisible();
}
const controls = (page: Page) => page.getByText('Valuation and calculation limits', { exact: true }).click();

test('combined default and keyboard-accessible per-account tabs show identical rows and totals without writes', async ({ page }) => {
    await seed(page, [buy, { ...buy, id: 'b', accountId: 'B', description: 'B buy', price: 200, brokerage: 20 }, sale]);
    await metric(page, 'Realized win', '68'); await metric(page, 'Investment', '2600'); await metric(page, 'Pending fees', '20');
    const before = await snapshot(page), summary = await totals(page).innerText();
    const grid = page.getByRole('grid', { name: 'Transactions', exact: true });
    const rows = (await grid.getByRole('row').allTextContents()).slice(1).sort();
    const columns = await grid.getByRole('columnheader').allTextContents();
    const feeCell = grid.getByRole('row').filter({ hasText: 'Synthetic sale' }).locator('td').nth(columns.indexOf('Acc. brokerage'));
    await expect(feeCell).toHaveText('12.000'); await expect(feeCell).toHaveCSS('border-bottom-style', 'solid');
    await page.getByRole('tab', { name: 'Combined', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Per account', exact: true })).toBeFocused();
    await expect(page.getByRole('tabpanel', { name: 'Per account', exact: true })).toBeVisible();
    await metric(page, 'Realized win', '68', 'A'); await metric(page, 'Investment', '600', 'A'); await metric(page, 'Investment', '2000', 'B'); await metric(page, 'Pending fees', '20', 'B');
    const separated: string[] = [];
    for (const account of ['A', 'B']) separated.push(...(await page.getByRole('region', { name: `Account ${account}`, exact: true }).getByRole('row').allTextContents()).slice(1));
    expect(separated.sort()).toEqual(rows); expect(await totals(page).innerText()).toBe(summary);
    await page.keyboard.press('Home'); await expect(page.getByRole('tab', { name: 'Combined', exact: true })).toBeFocused();
    await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: 'Per account', exact: true })).toBeFocused();
    expect(await snapshot(page)).toBe(before);
    await page.reload(); await expect(page.getByRole('tab', { name: 'Combined', exact: true })).toHaveAttribute('aria-selected', 'true'); expect(await snapshot(page)).toBe(before);
});

test('partial and consecutive sales consume only the current fee balance and buys restart accumulation', async ({ page }) => {
    await seed(page, [buy, sale, { ...buy, id: 'more', date: date(3), shares: 4, price: 200, brokerage: 4 }, { ...sale, id: 'partial', date: date(4), shares: 5, price: 180, brokerage: 3 }, { ...sale, id: 'close', date: date(5), shares: 5, price: 180, brokerage: 2 }]);
    await metric(page, 'Realized win', '459'); await metric(page, 'Investment', '0'); await metric(page, 'Pending fees', '0');
    const grid = page.getByRole('grid', { name: 'Transactions', exact: true });
    const index = (await grid.getByRole('columnheader').allTextContents()).indexOf('Acc. brokerage');
    const fees = []; for (const row of (await grid.getByRole('row').all()).slice(1)) fees.push(await row.locator('td').nth(index).innerText());
    expect(fees).toEqual(['10.000', '12.000', '4.000', '7.000', '2.000']);
});

test('historical cutoff retains excluded records and never substitutes trade prices for missing quotes', async ({ page }) => {
    await seed(page); const before = await snapshot(page); await controls(page);
    await page.getByLabel('Valuation time (UTC)').fill('2023-01-01T23:59:59');
    await metric(page, 'Shares', '10'); await metric(page, 'Investment', '1000'); await metric(page, 'Pending fees', '10'); await metric(page, 'Unrealized win', 'Unknown');
    await expect(page.getByText(/1 future transactions excluded/)).toBeVisible();
    await expect(page.getByRole('grid')).toContainText('Excluded: future date');
    await page.getByLabel('Valuation time (UTC)').fill(''); await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid UTC timestamp' })).toBeVisible();
    expect(await snapshot(page)).toBe(before);
});

test('oversells remain unknown and cannot borrow another account holding', async ({ page }) => {
    await seed(page, [buy, { ...buy, id: 'b', accountId: 'B' }, { ...sale, shares: 11 }]);
    await expect(totals(page)).toContainText('Sale exceeds available units'); await metric(page, 'Realized win', 'Unknown');
    await page.getByRole('tab', { name: 'Per account' }).click(); await metric(page, 'Investment', '1000', 'B');
    await expect(page.getByRole('region', { name: 'Account A', exact: true }).getByRole('grid')).toContainText('Calculation unavailable');
});

test('unknown same-day order blocks both views and keeps the unaffected account calculable', async ({ page }) => {
    await seed(page, [buy, { ...sale, date: buy.date }, { ...buy, id: 'b', accountId: 'B' }]);
    await expect(totals(page)).toContainText('same-day trade order is unknown');
    await page.getByRole('tab', { name: 'Per account' }).click();
    await expect(page.getByRole('region', { name: 'Account A', exact: true })).toContainText('same-day trade order is unknown');
    await metric(page, 'Shares', '10', 'B');
});

test('known retained order and wall times beat UUID display ordering and survive reload', async ({ page }) => {
    await seed(page, [{ ...sale, id: 'a', date: buy.date, tradeOrder: 2, tradeTime: '14:00' }, { ...buy, id: 'z', tradeOrder: 1, tradeTime: '09:00' }]);
    const before = await snapshot(page); await metric(page, 'Realized win', '68');
    const rows = page.getByRole('grid').getByRole('row'); await expect(rows.nth(1)).toContainText('09:00'); await expect(rows.nth(2)).toContainText('14:00');
    await page.reload(); await metric(page, 'Investment', '600'); expect(await snapshot(page)).toBe(before);
});

test('missing or conflicting quotes are unknown and stale prices are labeled estimates', async ({ page }) => {
    await seed(page, [buy], []); await metric(page, 'Unrealized win', 'Unknown'); await expect(totals(page)).toContainText('Valuation: missing');
    await restorePortfolio(page, [buy], [quote, { ...quote, id: 'conflict', price: 101 }]); await page.goto(route);
    await metric(page, 'Unrealized win', 'Unknown'); await expect(totals(page)).toContainText('Valuation: conflicting');
    await restorePortfolio(page, [buy], [quote]); await page.goto(route); await controls(page);
    await page.getByLabel('Valuation time (UTC)').fill('2023-01-20T00:00'); await expect(totals(page)).toContainText('stale estimates');
    await page.getByLabel('Stale after (days)').fill('30'); await expect(totals(page)).toContainText('Valuation: fresh');
});

test('duplicate and missing tickers retain separate UUID views and unknown currency metadata', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2023-01-10T12:00:00Z'));
    const records = [buy, { ...buy, id: 'other', instrumentId: otherInstrumentId, price: 200, brokerage: 0 }];
    await restorePortfolio(page, records, [quote], instruments.map(row => ({ ...row, ticker: 'SAME' })));
    await page.goto(route); await metric(page, 'Investment', '1000');
    await page.goto('/stock/transactions/' + otherInstrumentId); await metric(page, 'Investment', '2000'); await metric(page, 'Unrealized win', 'Unknown');
    await restorePortfolio(page, records, [quote], instruments.map(row => ({ ...row, ticker: null })));
    await page.goto(route); await expect(page.getByRole('heading', { name: /Synthetic share/ })).toBeVisible(); await expect(page.getByText(/Currency: Unknown/)).toBeVisible();
});

test('live account view follows rename, edit and deletion in another tab without writing extra history', async ({ page, context }) => {
    await seed(page); await page.getByRole('tab', { name: 'Per account' }).click();
    const editor = await context.newPage(); await editor.goto('/stock/edit/' + instrumentId);
    await editor.getByLabel('Instrument name', { exact: true }).fill('Renamed synthetic'); await editor.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(editor.getByText('Name updated.', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { level: 1 })).toContainText('Renamed synthetic');
    await editor.goto('/accounts/edit/A'); await editor.getByLabel('Account name', { exact: true }).fill('Renamed account'); await editor.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(editor.getByText('Name updated.', { exact: true })).toBeVisible(); await expect(page.getByRole('region', { name: 'Account A', exact: true }).getByRole('heading').first()).toContainText('Renamed account');
    await editor.goto(route + '/edit/sale'); await editor.getByLabel('Quantity', { exact: true }).fill('5'); await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor.getByText('Transaction updated.', { exact: true })).toBeVisible(); await metric(page, 'Investment', '500'); await metric(page, 'Realized win', '88');
    await editor.reload(); await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
    const cancelled = await snapshot(page); await editor.getByRole('button', { name: 'Cancel deletion', exact: true }).click(); expect(await snapshot(page)).toBe(cancelled);
    await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click(); await editor.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(editor.getByText(/^Transaction deleted\./)).toBeVisible(); await metric(page, 'Investment', '1000'); await metric(page, 'Pending fees', '10');
    await expect(page.getByRole('tab', { name: 'Per account' })).toHaveAttribute('aria-selected', 'true');
    const after = await snapshot(page); expect(JSON.parse(after).entityStates.some((row: { recordKey: string; deleted: boolean }) => row.recordKey === 'sale' && row.deleted)).toBe(true);
    await page.reload(); await metric(page, 'Investment', '1000'); expect(await snapshot(page)).toBe(after); await editor.close();
});

test('the removed experimental page and home navigation are absent', async ({ page }) => {
    await page.goto('/'); await expect(page.getByRole('link', { name: /experiment/i })).toHaveCount(0);
    const response = await page.goto('/experiment'); expect(response?.status()).toBe(404);
});
