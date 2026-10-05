import { expect, Page, test } from '@playwright/test';

const stores = ['accounts', 'stocks', 'transactions', 'stockPrices', 'localState', 'entityStates', 'outbox', 'instruments', 'operationDigests'];
async function snapshot(page: Page) {
    return page.evaluate(stores => new Promise<Record<string, any[]>>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, result: Record<string, any[]> = {};
            const tx = db.transaction(Array.from(db.objectStoreNames), 'readonly');
            for (const store of stores.filter(store => db.objectStoreNames.contains(store))) {
                const request = tx.objectStore(store).getAll(); request.onsuccess = () => { result[store] = request.result; };
            }
            tx.oncomplete = () => { result.version = [db.version]; db.close(); resolve(result); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }), stores);
}
async function account(page: Page, name: string) {
    await page.goto('/accounts/create');
    await page.getByLabel('Name:', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByLabel('Name:', { exact: true })).toHaveValue('');
}

test('two real tabs allocate a shared device sequence atomically and survive reload', async ({ page, context }) => {
    await account(page, 'Synthetic first');
    const other = await context.newPage();
    await Promise.all([account(page, 'Synthetic second'), account(other, 'Synthetic third')]);
    await page.reload();
    const data = await snapshot(page);
    expect(data.accounts).toHaveLength(3); expect(data.entityStates).toHaveLength(3); expect(data.outbox).toHaveLength(4);
    expect(data.outbox.map(row => row.sequence).sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(data.outbox.map(row => row.deviceId)).size).toBe(1);
    expect(data.entityStates.every(row => row.currency === null && row.tradeOrder === null)).toBe(true);
    await other.close();
});

test('outbox failure rolls back account, identity and sequence, then retries once', async ({ page }) => {
    await account(page, 'Synthetic initial');
    const before = await snapshot(page);
    await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        let fail = true;
        IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) {
            if (this.name === 'outbox' && fail) { fail = false; throw new DOMException('Synthetic failure', 'QuotaExceededError'); }
            return original.call(this, value, key);
        };
    });
    await page.getByLabel('Name:', { exact: true }).fill('Synthetic retry');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('not saved');
    expect(await snapshot(page)).toEqual(before);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByLabel('Name:', { exact: true })).toHaveValue('');
    const after = await snapshot(page);
    expect(after.accounts).toHaveLength(2); expect(after.outbox).toHaveLength(3);
    expect(after.localState[0].nextSequence).toBe(before.localState[0].nextSequence + 1);
});

async function legacy(page: Page, ambiguous = false) {
    await page.goto('/');
    await page.evaluate(ambiguous => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio', 10); // Dexie schema version 1.
        open.onupgradeneeded = () => {
            const db = open.result;
            db.createObjectStore('accounts', { keyPath: 'id' });
            db.createObjectStore('stocks', { keyPath: 'ticker' });
            db.createObjectStore('transactions', { keyPath: 'id' });
            db.createObjectStore('stockPrices', { keyPath: 'id' });
            open.transaction!.objectStore('accounts').add({ id: 'legacy', name: 'Synthetic legacy', ...(ambiguous ? { unknownHistoricalField: 'retain' } : {}) });
        };
        open.onsuccess = () => { open.result.close(); resolve(); }; open.onerror = () => reject(open.error);
    }), ambiguous);
}

test('supported v1 records upgrade without reset into one baseline and stable metadata', async ({ page }) => {
    await legacy(page);
    await page.goto('/accounts');
    await expect(page.getByText('Synthetic legacy', { exact: true })).toBeVisible();
    const data = await snapshot(page);
    expect(data.version).toEqual([40]); expect(data.accounts).toEqual([{ id: 'legacy', name: 'Synthetic legacy' }]);
    expect(data.outbox).toHaveLength(2); expect(data.outbox.map(row => row.kind).sort()).toEqual(['baseline', 'migration']); expect(data.entityStates).toHaveLength(1);
    await page.reload(); expect(await snapshot(page)).toEqual(data);
});

test('ambiguous legacy data is retained when upgrade is refused', async ({ page }) => {
    await legacy(page, true);
    await page.goto('/backup');
    await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    const data = await snapshot(page);
    expect(data.version).toEqual([10]); expect(data.accounts[0].unknownHistoricalField).toBe('retain');
    expect(data).not.toHaveProperty('outbox');
});

test('interrupted browser migration rolls back and upgrades on a clean retry', async ({ page }) => {
    await legacy(page);
    await page.goto('/backup');
    await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) {
            if (this.name === 'outbox') throw new DOMException('Synthetic interrupted migration', 'QuotaExceededError');
            return original.call(this, value, key);
        };
    });
    await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    expect((await snapshot(page)).version).toEqual([10]);
    await page.goto('/accounts');
    await expect(page.getByText('Synthetic legacy', { exact: true })).toBeVisible();
    const data = await snapshot(page); expect(data.version).toEqual([40]); expect(data.outbox).toHaveLength(2);
});
