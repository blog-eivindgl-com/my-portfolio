import { expect, Page, test } from '@playwright/test';
import numeric from '../test-fixtures/database/numeric-v1.json';
import ordered from '../test-fixtures/database/ordered-v1.json';
async function seed(page: Page, fixture: any) {
    await page.goto('/'); await page.evaluate(fixture => new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('my-portfolio', 10);
        request.onupgradeneeded = () => {
            for (const [name, schema] of Object.entries(fixture.stores)) {
                const fields = (schema as string).split(',').map(s => s.trim()), auto = fields[0].startsWith('++');
                const store = request.result.createObjectStore(name, { keyPath: fields[0].replace('++',''), autoIncrement: auto });
                for (const index of fields.slice(1)) store.createIndex(index,index);
                for (const row of fixture.records[name]) store.add(row);
            }
        }; request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    }), fixture);
}
async function snapshot(page: Page) {
    return page.evaluate(() => new Promise<any>((resolve, reject) => { const request = indexedDB.open('my-portfolio'); request.onerror = () => reject(request.error); request.onsuccess = () => {
        const db = request.result, names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly'), records: any = {};
        for (const name of names) { const get = tx.objectStore(name).getAll(); get.onsuccess = () => { records[name] = get.result; }; }
        tx.oncomplete = () => { const version = db.version; db.close(); resolve({ version, records }); }; tx.onabort = () => reject(tx.error);
    }; }));
}
async function exportBackup(page: Page) { await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup', exact: true }).click()]); }
for (const fixture of [numeric, ordered]) test(`historical ${fixture.sourceRevision} migrates to UUIDs with retained source and survives reload`, async ({ page }) => {
    await seed(page,fixture); const before = await snapshot(page); await page.goto('/backup'); await exportBackup(page); const migrated = await snapshot(page);
    expect(migrated.version).toBe(40); expect(migrated.records.outbox).toHaveLength(1); expect(migrated.records.outbox[0].payload.sourceMigration.records).toEqual(before.records);
    expect(migrated.records.transactions).toHaveLength(2); expect(migrated.records.accounts[0].id).toMatch(/^[0-9a-f-]{36}$/);
    for (const row of migrated.records.transactions) { expect(row.accountId).toBe(migrated.records.accounts[0].id); expect(row.instrumentId).toBe(migrated.records.instruments[0].id); }
    await page.reload(); await exportBackup(page); expect(await snapshot(page)).toEqual(migrated);
    await page.goto(`/stock/transactions/${migrated.records.instruments[0].id}`); await expect(page.getByRole('grid', { name: 'Transactions', exact: true })).toContainText('Synthetic buy');
});
test('duplicate historical order is refused with actionable diagnostics and intact source', async ({ page }) => {
    const fixture = structuredClone(ordered); fixture.records.transactions[1].order = 0; await seed(page, fixture); const before = await snapshot(page);
    await page.goto('/backup'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); await expect(page.locator('main').getByRole('alert')).toContainText('duplicate count-based trade order');
    await expect(page.locator('main').getByRole('alert')).toContainText('do not clear storage'); expect(await snapshot(page)).toEqual(before);
});
test('interrupted historical upgrade rolls back deleted/recreated stores and retries cleanly', async ({ page }) => {
    await seed(page,numeric); const before = await snapshot(page); await page.goto('/backup');
    await page.evaluate(() => { const add = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) { if (this.name === 'operationDigests') throw new DOMException('Synthetic interruption', 'QuotaExceededError'); return add.call(this,value,key); }; });
    await page.getByRole('button', { name: 'Export backup', exact: true }).click(); await expect(page.locator('main').getByRole('alert')).toBeVisible(); expect(await snapshot(page)).toEqual(before);
    await page.reload(); await exportBackup(page); expect((await snapshot(page)).version).toBe(40);
});
test('two tabs racing historical migration retain one baseline and mapping', async ({ page, context }) => {
    await seed(page,numeric); await page.goto('/backup'); const other = await context.newPage(); await other.goto('/backup');
    try { await Promise.all([exportBackup(page),exportBackup(other)]); const result = await snapshot(page); expect(result.records.outbox).toHaveLength(1); expect(result.records.operationDigests).toHaveLength(1); expect(await snapshot(other)).toEqual(result); } finally { await other.close(); }
});
test('explicit historical order resolves same-day chronology without inventing clock time', async ({ page }) => {
    const fixture = structuredClone(ordered); fixture.records.transactions[1].date = fixture.records.transactions[0].date;
    await seed(page,fixture); await page.goto('/backup'); await exportBackup(page); const data = await snapshot(page);
    await page.goto(`/stock/transactions/${data.records.instruments[0].id}`); const grid = page.getByRole('grid', { name: 'Transactions', exact: true });
    await expect(grid.getByRole('row').nth(1)).toContainText('Synthetic buy'); await expect(grid.getByRole('row').nth(2)).toContainText('Synthetic partial sale');
    await expect(grid.getByRole('columnheader', { name: 'Retained trade order', exact: true })).toBeVisible(); await expect(page.getByText(/Calculations are unavailable because same-day trade order is unknown/)).toHaveCount(0);
});
