import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import fixture from '../test-fixtures/backup/portfolio-v4.json';

const source = JSON.stringify(fixture);
const stores = ['accounts', 'instruments', 'transactions', 'stockPrices', 'localState', 'entityStates', 'outbox', 'operationDigests'];
async function snapshot(page: Page) {
    return page.evaluate(stores => new Promise<Record<string, any[]>>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio'); open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tx = db.transaction(stores, 'readonly'), result: Record<string, any[]> = {};
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
    await page.goto('/backup'); await page.getByLabel('Backup JSON file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByText(/File loaded/)).toBeVisible(); await page.getByLabel('Restore mode', { exact: true }).selectOption(mode);
    await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
}
async function restore(page: Page, text = source) {
    await preview(page, text); await download(page, 'Download recovery backup'); await page.getByLabel('I verified that the recovery backup file is saved.').check();
    await page.getByLabel(/I understand replacement/).check(); await page.getByRole('button', { name: 'Apply restore', exact: true }).click(); await expect(page.getByText(/Restore complete/)).toBeVisible();
}
const cases = [
    { store: 'accounts', key: fixture.records.accounts[0].id, original: fixture.records.accounts[0].name, route: `/accounts/edit/${fixture.records.accounts[0].id}`, list: '/accounts', label: 'Account name' },
    { store: 'instruments', key: fixture.records.instruments[0].id, original: fixture.records.instruments[0].name, route: `/stock/edit/${fixture.records.instruments[0].id}`, list: '/stock', label: 'Instrument name' },
];
async function save(page: Page) { await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.getByText('Name updated.', { exact: true })).toBeVisible(); }
for (const item of cases) {
    test(`${item.store}: list link, validation, cancellation and repeated submit preserve identity and trades`, async ({ page }) => {
        await restore(page); await page.goto(item.list);
        await page.getByRole('link', { name: `Edit name for ${item.original}`, exact: true }).click(); const before = await snapshot(page);
        await page.getByLabel(item.label, { exact: true }).fill('Unsaved change'); await page.getByRole('link', { name: /^Back to/ }).click(); expect(await snapshot(page)).toEqual(before);
        await page.goto(item.route); await page.getByLabel(item.label, { exact: true }).fill('  '); await page.getByRole('button', { name: 'Save name', exact: true }).click();
        await expect(page.getByRole('form').getByRole('alert')).toHaveText('Enter a nonempty name.'); expect(await snapshot(page)).toEqual(before);
        await page.getByLabel(item.label, { exact: true }).fill('  Renamed Å & Fund  ');
        await page.getByRole('form').evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
        await expect(page.getByText('Name updated.', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Save name', exact: true })).toBeDisabled();
        const after = await snapshot(page); expect(after.outbox.length).toBe(before.outbox.length + 1); expect(after.transactions).toEqual(before.transactions); expect(after.stockPrices).toEqual(before.stockPrices);
        const entity = (data: Record<string, any[]>) => data.entityStates.find(row => row.store === item.store && row.recordKey === item.key);
        expect(entity(after).entityId).toBe(entity(before).entityId);
        expect(after.outbox.find(row => row.kind === 'rename')).toMatchObject({ operationVersion: 4, baseRevision: entity(before).revision, payload: { command: { store: item.store, recordKey: item.key, name: '  Renamed Å & Fund  ' } } });
        await page.reload(); await expect(page.getByLabel(item.label, { exact: true })).toHaveValue('  Renamed Å & Fund  ');
        await page.getByRole('link', { name: /^Back to/ }).click(); await expect(page.getByRole('link', { name: /Edit name for.*Renamed/ })).toBeVisible();
    });

    test(`${item.store}: storage failure retains input and retry applies once`, async ({ page }) => {
        await restore(page); await page.goto(item.route); const before = await snapshot(page);
        await page.getByLabel(item.label, { exact: true }).fill('Retry name');
        await page.evaluate(() => {
            const add = IDBObjectStore.prototype.add; let fail = true;
            IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) { if (this.name === 'outbox' && fail) { fail = false; throw new DOMException('Synthetic failure', 'QuotaExceededError'); } return add.call(this, value, key); };
        });
        await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.getByRole('form').getByRole('alert')).toContainText('Could not save');
        await expect(page.getByLabel(item.label, { exact: true })).toHaveValue('Retry name'); expect(await snapshot(page)).toEqual(before); await save(page);
        expect((await snapshot(page)).outbox.length).toBe(before.outbox.length + 1);
    });

    test(`${item.store}: two tabs reject stale rename without losing input, then reload explicitly`, async ({ page, context }) => {
        await restore(page); await page.goto(item.route); const other = await context.newPage(); await other.goto(item.route);
        await other.getByLabel(item.label, { exact: true }).fill('Stale draft'); await page.getByLabel(item.label, { exact: true }).fill('Winning name'); await save(page); const before = await snapshot(page);
        await other.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(other.getByRole('form').getByRole('alert')).toContainText('changed in another tab');
        await expect(other.getByLabel(item.label, { exact: true })).toHaveValue('Stale draft'); expect(await snapshot(other)).toEqual(before);
        await expect(other.getByRole('button', { name: 'Save name', exact: true })).toBeDisabled(); await other.getByRole('button', { name: 'Reload latest and discard my edits' }).click();
        await expect(other.getByLabel(item.label, { exact: true })).toHaveValue('Winning name'); await other.getByLabel(item.label, { exact: true }).fill('Reviewed name'); await save(other); await other.close();
    });

    test(`${item.store}: another-tab replacement prevents a pre-restore rename`, async ({ page, context }) => {
        await restore(page); await page.goto(item.route); await page.getByLabel(item.label, { exact: true }).fill('Old dataset draft');
        const other = await context.newPage(); await restore(other); const before = await snapshot(other);
        await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.getByRole('form').getByRole('alert')).toContainText('restored or replaced'); expect(await snapshot(page)).toEqual(before);
        await page.getByRole('button', { name: 'Reload latest and discard my edits' }).click(); await expect(page.getByLabel(item.label, { exact: true })).toHaveValue(item.original); await other.close();
    });

    test(`${item.store}: unavailable identity never enables a save`, async ({ page }) => {
        await restore(page); await page.goto(item.route + '-missing'); await expect(page.locator('main').getByRole('alert')).toContainText('unavailable');
        const before = await snapshot(page); await page.getByRole('button', { name: 'Retry loading' }).click(); await expect(page.locator('main').getByRole('alert')).toContainText('unavailable');
        await expect(page.getByRole('button', { name: 'Save name', exact: true })).toHaveCount(0); expect(await snapshot(page)).toEqual(before);
    });
}

test('renamed accounts and instruments round-trip into a fresh context without changing trades or identities', async ({ page, browser }, info) => {
    await restore(page); const initial = await snapshot(page);
    for (const item of cases) { await page.goto(item.route); await page.getByLabel(item.label, { exact: true }).fill(`Renamed ${item.store}`); await save(page); }
    await page.goto('/backup'); const exported = await download(page, 'Export backup'); expect(JSON.parse(exported).formatVersion).toBe(4);
    const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:3100', timezoneId: info.project.use.timezoneId, locale: info.project.use.locale });
    try {
        const restored = await fresh.newPage(); await restore(restored, exported); const before = await snapshot(restored);
        expect(before.transactions).toEqual(initial.transactions); expect(before.stockPrices).toEqual(initial.stockPrices);
        expect(before.entityStates.map(row => row.entityId).sort()).toEqual(initial.entityStates.map(row => row.entityId).sort());
        for (const item of cases) { await restored.goto(item.route); await expect(restored.getByLabel(item.label, { exact: true })).toHaveValue(`Renamed ${item.store}`); }
        await preview(restored, source, 'merge'); await expect(restored.getByText(/conflicting record identities block merge/)).toBeVisible();
        await expect(restored.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled(); expect(await snapshot(restored)).toEqual(before);
    } finally { await fresh.close(); }
});
