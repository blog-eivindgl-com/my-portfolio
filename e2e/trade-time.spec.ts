import { expect, Page, test } from '@playwright/test';
async function setup(page: Page) {
    await page.goto('/accounts/create');
    await page.getByLabel('Name:', { exact: true }).fill('Synthetic time account');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByLabel('Name:', { exact: true })).toHaveValue('');
    await page.goto('/stock/create');
    await page.getByLabel('Ticker:', { exact: true }).fill('CLOCK');
    await page.getByLabel('Name:', { exact: true }).fill('Synthetic clock instrument');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByLabel('Ticker:', { exact: true })).toHaveValue('');
}
async function fill(page: Page, date: string, time: string, description: string) {
    await page.goto('/stock/transactions/CLOCK/create');
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Synthetic time account' });
    await page.getByLabel('Trade date', { exact: true }).fill(date);
    await page.getByLabel('Trade time (optional)', { exact: true }).fill(time);
    await page.getByLabel('Description (optional)', { exact: true }).fill(description);
    await page.getByLabel('Quantity', { exact: true }).fill('1');
    await page.getByLabel('Price per unit', { exact: true }).fill('10');
}
async function save(page: Page) {
    await page.getByRole('button', { name: /^(Save transaction|Retry save)$/ }).click();
    await expect(page.getByText('Transaction saved.', { exact: true })).toBeVisible();
}
async function trades(page: Page) {
    return page.evaluate(() => new Promise<any[]>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio');
        open.onsuccess = () => { const db = open.result; const tx = db.transaction('transactions', 'readonly'); const request = tx.objectStore('transactions').getAll(); tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
        open.onerror = () => reject(open.error);
    }));
}
for (const date of ['2024-03-10', '2024-11-03', '2024-03-31', '2024-10-27']) {
    test(`preserves wall-clock time and orders reverse-entered trades on DST boundary ${date}`, async ({ page }) => {
        await setup(page);
        await fill(page, date, '15:30', 'Later trade'); await save(page);
        await fill(page, date, '02:30', 'Earlier trade'); await save(page);
        const records = await trades(page);
        expect(records.find(row => row.description === 'Earlier trade')).toMatchObject({ date: Date.parse(`${date}T00:00:00Z`), tradeTime: '02:30' });
        await page.goto('/stock/transactions/CLOCK');
        const rows = page.getByRole('grid', { name: 'Transactions', exact: true }).getByRole('row');
        await expect(rows.nth(1)).toContainText('Earlier trade'); await expect(rows.nth(1)).toContainText('02:30');
        await expect(rows.nth(2)).toContainText('Later trade');
        await page.reload(); await expect(rows.nth(1)).toContainText('02:30');
    });
}

test('cleared optional time stays unknown, distinct from midnight, and same-day ambiguity is visible', async ({ page }) => {
    await setup(page);
    await fill(page, '2024-10-27', '12:30', 'Unknown time');
    await page.getByLabel('Trade time (optional)', { exact: true }).fill(''); await save(page);
    await fill(page, '2024-10-27', '00:00', 'Known midnight'); await save(page);
    const records = await trades(page);
    expect(records.find(row => row.description === 'Unknown time')).not.toHaveProperty('tradeTime');
    expect(records.find(row => row.description === 'Known midnight').tradeTime).toBe('00:00');
    await page.goto('/stock/transactions/CLOCK');
    await expect(page.getByText(/Calculations are unavailable because same-day trade order is unknown/)).toBeVisible();
    await expect(page.getByRole('grid', { name: 'Transactions', exact: true })).toContainText('Unknown');
});

test('failed save retains optional time and allows changing it before retry without duplicate records', async ({ page }) => {
    await setup(page); await fill(page, '2024-03-31', '09:00', 'Retry trade');
    await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add; let fail = true;
        IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) { if (this.name === 'outbox' && fail) { fail = false; throw new DOMException('Synthetic failure', 'QuotaExceededError'); } return add.call(this, value, key); };
    });
    await page.getByRole('button', { name: 'Save transaction', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Create transaction' }).getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Trade time (optional)', { exact: true })).toHaveValue('09:00');
    expect(await trades(page)).toHaveLength(0);
    await page.getByLabel('Trade time (optional)', { exact: true }).fill('09:15'); await save(page);
    expect(await trades(page)).toHaveLength(1); expect((await trades(page))[0].tradeTime).toBe('09:15');
});
