import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import fixture from '../test-fixtures/backup/portfolio-v2.json';

const trade = fixture.records.transactions[0];
const route = `/stock/transactions/${trade.ticker}/edit/${trade.id}`;
const stores = ['accounts', 'stocks', 'transactions', 'stockPrices', 'localState', 'entityStates', 'outbox'];
async function snapshot(page: Page) {
    return page.evaluate(stores => new Promise<Record<string, any[]>>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio'); open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, result: Record<string, any[]> = {}, tx = db.transaction(stores, 'readonly');
            for (const store of stores) { const get = tx.objectStore(store).getAll(); get.onsuccess = () => { result[store] = get.result; }; }
            tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }), stores);
}
async function download(page: Page, name: string) {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
    const path = await file.path(); if (!path) throw new Error('Missing synthetic download'); return readFile(path, 'utf8');
}
async function preview(page: Page, text: string, mode = 'replace') {
    await page.goto('/backup');
    await page.getByLabel('Backup JSON file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByText(/File loaded/)).toBeVisible(); await page.getByLabel('Restore mode', { exact: true }).selectOption(mode);
    await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
}
async function restore(page: Page, text: string) {
    await preview(page, text); await download(page, 'Download recovery backup');
    await page.getByLabel('I verified that the recovery backup file is saved.').check(); await page.getByLabel(/I understand replacement/).check();
    await page.getByRole('button', { name: 'Apply restore', exact: true }).click(); await expect(page.getByText(/Restore complete/)).toBeVisible();
}
async function setup(page: Page) {
    await restore(page, JSON.stringify(fixture)); await page.goto(route); await expect(page.getByLabel('Quantity', { exact: true })).toBeVisible();
}
async function save(page: Page) {
    await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.getByText('Transaction updated.', { exact: true })).toBeVisible();
}
async function deleteTrade(page: Page) {
    await page.getByRole('button', { name: 'Delete transaction', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click(); await expect(page.getByText(/^Transaction deleted\./)).toBeVisible();
}
async function failOnce(page: Page) {
    await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add; let fail = true;
        IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) {
            if (this.name === 'outbox' && fail) { fail = false; throw new DOMException('Synthetic failure', 'QuotaExceededError'); }
            return add.call(this, value, key);
        };
    });
}

for (const date of ['2024-03-10', '2024-11-03', '2024-03-31', '2024-10-27']) {
    test(`corrects date/time on DST boundary ${date} with stable identity and one repeated-submit operation`, async ({ page }) => {
        await setup(page); const before = await snapshot(page);
        await page.getByLabel('Trade date', { exact: true }).fill(date); await page.getByLabel('Trade time (optional)', { exact: true }).fill('02:30');
        // Two synchronous submit events exercise the imperative guard before React rerenders.
        await page.getByRole('form', { name: 'Edit transaction' }).evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
        await expect(page.getByText('Transaction updated.', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
        const after = await snapshot(page); expect(after.outbox.length).toBe(before.outbox.length + 1);
        expect(after.transactions.find(row => row.id === trade.id)).toEqual({ ...trade, date: Date.parse(`${date}T00:00:00Z`), tradeTime: '02:30' });
        expect(after.entityStates.find(row => row.recordKey === trade.id).entityId).toBe(before.entityStates.find(row => row.recordKey === trade.id).entityId);
        await page.reload(); await expect(page.getByLabel('Trade date', { exact: true })).toHaveValue(date); await expect(page.getByLabel('Trade time (optional)', { exact: true })).toHaveValue('02:30');
    });
}

test('back navigation and cancelled deletion write nothing; unknown and midnight remain distinct', async ({ page }) => {
    await setup(page); const before = await snapshot(page);
    await page.getByLabel('Price per unit', { exact: true }).fill('44');
    await page.getByRole('button', { name: 'Delete transaction', exact: true }).click(); await page.getByRole('button', { name: 'Cancel deletion', exact: true }).click();
    expect(await snapshot(page)).toEqual(before);
    await page.getByRole('link', { name: 'Back to transactions' }).click();
    await page.getByRole('link', { name: 'Edit / delete', exact: true }).first().click();
    expect(await snapshot(page)).toEqual(before);
    await page.goto(route); await page.getByLabel('Trade time (optional)', { exact: true }).fill(''); await save(page);
    expect((await snapshot(page)).transactions.find(row => row.id === trade.id)).not.toHaveProperty('tradeTime');
    await page.reload(); await page.getByLabel('Trade time (optional)', { exact: true }).fill('00:00'); await save(page);
    expect((await snapshot(page)).transactions.find(row => row.id === trade.id).tradeTime).toBe('00:00');
});

test('two tabs reject a stale edit, preserve input, and require explicit reload', async ({ page, context }) => {
    await setup(page); const other = await context.newPage(); await other.goto(route);
    await other.getByLabel('Price per unit', { exact: true }).fill('222');
    await page.getByLabel('Price per unit', { exact: true }).fill('111'); await save(page); const before = await snapshot(page);
    await other.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(other.getByRole('form').getByRole('alert')).toContainText('changed in another tab');
    await expect(other.getByLabel('Price per unit', { exact: true })).toHaveValue('222'); expect(await snapshot(other)).toEqual(before);
    await other.getByRole('button', { name: 'Reload latest and discard my edits' }).click();
    await expect(other.getByLabel('Price per unit', { exact: true })).toHaveValue('111');
    await other.getByLabel('Price per unit', { exact: true }).fill('123'); await save(other); await other.close();
});

test('correcting same-day times preserves unknown and equal-time warnings until order is known', async ({ page }) => {
    await setup(page);
    const sale = fixture.records.transactions.find(row => row.type === 1)!;
    await page.getByLabel('Trade date', { exact: true }).fill(new Date(sale.date).toISOString().slice(0, 10)); await save(page);
    await page.getByRole('link', { name: 'Back to transactions' }).click(); await expect(page.getByText(/Calculations are unavailable because same-day trade order is unknown/)).toBeVisible();
    await page.goto(`/stock/transactions/${sale.ticker}/edit/${sale.id}`); await page.getByLabel('Trade time (optional)', { exact: true }).fill(trade.tradeTime!); await save(page);
    await page.getByRole('link', { name: 'Back to transactions' }).click(); await expect(page.getByText(/Calculations are unavailable because same-day trade order is unknown/)).toBeVisible();
    await page.goto(`/stock/transactions/${sale.ticker}/edit/${sale.id}`); await page.getByLabel('Trade time (optional)', { exact: true }).fill('10:30'); await save(page);
    await page.getByRole('link', { name: 'Back to transactions' }).click(); await expect(page.getByRole('grid', { name: 'Transactions', exact: true })).toBeVisible();
    await expect(page.getByText(/Calculations are unavailable because same-day trade order is unknown/)).toHaveCount(0);
});

test('two tabs reject stale deletion after edit and stale edit after deletion', async ({ page, context }) => {
    await setup(page); const other = await context.newPage(); await other.goto(route);
    await other.getByRole('button', { name: 'Delete transaction', exact: true }).click();
    await page.getByLabel('Price per unit', { exact: true }).fill('111'); await save(page);
    await other.getByRole('button', { name: 'Confirm deletion', exact: true }).click(); await expect(other.getByRole('form').getByRole('alert')).toContainText('changed in another tab');
    await other.getByRole('button', { name: 'Reload latest and discard my edits' }).click(); await expect(other.getByLabel('Price per unit', { exact: true })).toHaveValue('111');
    await page.reload(); await page.getByLabel('Price per unit', { exact: true }).fill('222');
    await deleteTrade(other); const before = await snapshot(other);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.getByRole('form').getByRole('alert')).toContainText('changed in another tab');
    expect(await snapshot(page)).toEqual(before);
    await page.getByRole('button', { name: 'Reload latest and discard my edits' }).click(); await expect(page.locator('main').getByRole('alert')).toContainText('deleted or is unavailable');
    await other.close();
});

test('edit and deletion failures roll back all stores, retain input and retry once', async ({ page }) => {
    await setup(page); const before = await snapshot(page); await page.getByLabel('Trade time (optional)', { exact: true }).fill('08:15');
    await failOnce(page); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('form').getByRole('alert')).toContainText('Could not save'); expect(await snapshot(page)).toEqual(before);
    await expect(page.getByLabel('Trade time (optional)', { exact: true })).toHaveValue('08:15'); await save(page);
    await page.reload(); const edited = await snapshot(page); await failOnce(page);
    await page.getByRole('button', { name: 'Delete transaction', exact: true }).click(); await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.getByRole('form').getByRole('alert')).toContainText('Could not save'); expect(await snapshot(page)).toEqual(edited);
    await page.getByRole('button', { name: 'Confirm deletion', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.getByText(/^Transaction deleted\./)).toBeVisible();
    const deleted = await snapshot(page); expect(deleted.outbox.length).toBe(edited.outbox.length + 1); expect(deleted.transactions.some(row => row.id === trade.id)).toBe(false);
    await page.reload(); await expect(page.locator('main').getByRole('alert')).toContainText('deleted or is unavailable'); expect(await snapshot(page)).toEqual(deleted);
});

test('deleted transaction survives fresh-context restore and stale merge cannot resurrect it', async ({ page, browser }, info) => {
    await setup(page); await deleteTrade(page); await page.goto('/backup'); const backup = await download(page, 'Export backup');
    expect(JSON.parse(backup).formatVersion).toBe(3);
    const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:3100', timezoneId: info.project.use.timezoneId, locale: info.project.use.locale });
    try {
        const restored = await fresh.newPage(); await restore(restored, backup); const before = await snapshot(restored);
        expect(before.outbox[0]).toMatchObject({ kind: 'baseline', operationVersion: 2 });
        expect(before.transactions.some(row => row.id === trade.id)).toBe(false); expect(before.entityStates.find(row => row.recordKey === trade.id).deleted).toBe(true);
        await preview(restored, JSON.stringify(fixture), 'merge');
        await expect(restored.getByText(/conflicts with a deletion marker/)).toBeVisible(); await expect(restored.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled(); expect(await snapshot(restored)).toEqual(before);
        await restore(restored, JSON.stringify(fixture)); expect((await snapshot(restored)).transactions.some(row => row.id === trade.id)).toBe(true);
    } finally { await fresh.close(); }
});
