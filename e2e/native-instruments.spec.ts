import { expect, Page, test } from '@playwright/test';
async function instrument(page: Page, name: string, ticker = '') {
    await page.goto('/stock/create'); await page.getByLabel('Name:', { exact: true }).fill(name);
    await page.getByLabel('Ticker (optional):', { exact: true }).fill(ticker);
    await page.getByLabel('Instrument kind:', { exact: true }).selectOption('fund');
    await page.getByLabel('Currency code (optional):', { exact: true }).fill('NOK');
    await page.getByLabel('Exchange (optional):', { exact: true }).fill('Synthetic exchange');
    await page.getByRole('button', { name: 'Create', exact: true }).dblclick(); await expect(page.getByRole('status')).toContainText('Instrument saved.');
}
async function rows(page: Page) {
    return page.evaluate(() => new Promise<any[]>((resolve, reject) => {
        const request = indexedDB.open('my-portfolio'); request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result, tx = db.transaction('instruments', 'readonly'), get = tx.objectStore('instruments').getAll(); tx.oncomplete = () => { db.close(); resolve(get.result); }; tx.onabort = () => reject(tx.error); };
    }));
}
test('creates a tickerless fund with explicit metadata and stable UUID links across restart', async ({ page }) => {
    await instrument(page, 'Synthetic tickerless fund'); const saved = await rows(page); expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ ticker: null, instrumentKind: 'fund', currency: 'NOK', exchange: 'Synthetic exchange', isin: null });
    expect(saved[0].id).toMatch(/^[0-9a-f-]{36}$/);
    await page.goto('/stock'); await page.getByRole('link', { name: 'Edit name for Synthetic tickerless fund', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/stock/edit/${saved[0].id}$`)); await page.getByLabel('Instrument name', { exact: true }).fill('Renamed fund');
    await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.getByText('Name updated.', { exact: true })).toBeVisible(); await page.reload();
    expect(await rows(page)).toEqual([{ ...saved[0], name: 'Renamed fund' }]);
    await page.goto(`/stock/transactions/${saved[0].id}`); await expect(page.getByRole('heading', { name: /Renamed fund/ })).toBeVisible();
});
test('duplicate ticker labels retain independent IDs and an ambiguous old link cannot select either', async ({ page }) => {
    await instrument(page, 'Synthetic first fund', 'DUP'); await instrument(page, 'Synthetic second fund', 'DUP');
    const saved = await rows(page); expect(saved).toHaveLength(2); expect(new Set(saved.map(row => row.id)).size).toBe(2);
    await page.goto('/stock/transactions/DUP'); await expect(page.getByText('Instrument unavailable or ticker ambiguous. Open an instrument from the list.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create transaction', exact: true })).toHaveCount(0);
    for (const row of saved) { await page.goto(`/stock/transactions/${row.id}`); await expect(page.getByRole('heading', { name: `DUP - ${row.name}` })).toBeVisible(); }
});
test('instrument save failure retains its UUID intent and retries exactly once', async ({ page }) => {
    await page.goto('/stock/create'); await page.getByLabel('Name:', { exact: true }).fill('Synthetic retry fund');
    // Initialize first so this injection targets the mutation rather than population.
    await page.goto('/backup'); await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup', exact: true }).click()]); await page.goto('/stock/create'); await page.getByLabel('Name:', { exact: true }).fill('Synthetic retry fund');
    await page.evaluate(() => { const original = IDBObjectStore.prototype.add; let fail = true; IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) { if (this.name === 'operationDigests' && fail) { fail = false; throw new DOMException('Synthetic failure', 'QuotaExceededError'); } return original.call(this, value, key); }; });
    await page.getByRole('button', { name: 'Create', exact: true }).click(); await expect(page.locator('form').getByRole('alert')).toBeVisible(); expect(await rows(page)).toHaveLength(0);
    await expect(page.getByLabel('Name:', { exact: true })).toHaveValue('Synthetic retry fund'); await page.getByRole('button', { name: 'Create', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Instrument saved.');
    expect(await rows(page)).toHaveLength(1); await page.reload(); expect(await rows(page)).toHaveLength(1);
});
