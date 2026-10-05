import { expect, Page, test } from '@playwright/test';
import type { ITransaction } from '../src/app/database/types/types';

// Playwright creates a fresh, nonpersistent browser context for each test.
// No user's browser profile or stored portfolio is opened.
async function seed(page: Page) {
    await page.clock.setFixedTime(new Date('2024-01-01T00:30:00Z'));
    await page.goto('/');
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio', 10);
        open.onupgradeneeded = () => {
            open.result.createObjectStore('accounts', { keyPath: 'id' });
            open.result.createObjectStore('stocks', { keyPath: 'ticker' });
            open.result.createObjectStore('transactions', { keyPath: 'id' });
            open.result.createObjectStore('stockPrices', { keyPath: 'id' });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['accounts', 'stocks'], 'readwrite');
            tx.objectStore('accounts').put({ id: 'account-a', name: 'Synthetic A' });
            tx.objectStore('accounts').put({ id: 'account-b', name: 'Synthetic B' });
            tx.objectStore('stocks').put({ ticker: 'SYNTH', name: 'Synthetic instrument' });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }));
    await page.goto('/stock/transactions/SYNTH/create');
    await expect(page.getByLabel('Account')).toBeEnabled();
    await expect(page.getByRole('option', { name: 'Synthetic B' })).toHaveCount(1);
}

async function fill(page: Page) {
    await page.getByLabel('Account').selectOption('account-b');
    await page.getByLabel('Trade date').fill('2024-02-29');
    await page.getByLabel('Quantity').fill('1,25');
    await page.getByLabel('Price per unit').fill('10.50');
    await page.getByLabel('Brokerage / fees').fill('0');
}

async function records(page: Page): Promise<ITransaction[]> {
    return page.evaluate(() => new Promise<ITransaction[]>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('transactions', 'readonly');
            const get = tx.objectStore('transactions').getAll();
            tx.oncomplete = () => { db.close(); resolve(get.result); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }));
}

async function removeReference(page: Page, store: 'accounts' | 'instruments', key: string) {
    await page.evaluate(({ store, key }) => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('my-portfolio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(store, 'readwrite');
            if (store === 'instruments') { const get = tx.objectStore(store).index('ticker').get(key); get.onsuccess = () => tx.objectStore(store).delete(get.result.id); } else tx.objectStore(store).delete(key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }), { store, key });
}

test('defaults to the client calendar day and persists the chosen account, fractional quantity and UTC trade day', async ({ page }, info) => {
    await seed(page);
    await expect(page.getByLabel('Trade date')).toHaveValue(info.project.name === 'los-angeles' ? '2023-12-31' : '2024-01-01');
    await fill(page);
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByText('Transaction saved.')).toBeVisible();
    const saved = await records(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ instrumentId: expect.any(String), accountId: 'account-b', shares: 1.25, price: 10.5, brokerage: 0, date: Date.UTC(2024, 1, 29) });
    await page.getByRole('link', { name: 'Back to transactions' }).click();
    await expect(page.getByText(info.project.name === 'oslo' ? '29.2.2024' : '2/29/2024', { exact: true })).toBeVisible();
    await page.reload();
    expect(await records(page)).toEqual(saved);
});

test('rejects invalid or missing values without persisting a record', async ({ page }) => {
    await seed(page);
    await fill(page);
    await page.getByLabel('Account').selectOption('');
    await page.getByLabel('Trade date').fill('');
    await page.getByLabel('Quantity').fill('0x10');
    await page.getByLabel('Price per unit').fill('Infinity');
    await page.getByLabel('Brokerage / fees').fill('-1');
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByRole('form', { name: 'Create transaction' }).getByRole('alert')).toContainText('Check the highlighted');
    for (const label of ['Account', 'Trade date', 'Quantity', 'Price per unit', 'Brokerage / fees']) {
        await expect(page.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(await records(page)).toHaveLength(0);
});

test('deduplicates double submit and requires an explicit new transaction after success', async ({ page }) => {
    await seed(page);
    await fill(page);
    await page.getByRole('button', { name: 'Save transaction' }).dblclick();
    await expect(page.getByText('Transaction saved.')).toBeVisible();
    expect(await records(page)).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Save transaction' })).toBeDisabled();
    await page.getByRole('button', { name: 'Create another transaction' }).click();
    await fill(page);
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByText('Transaction saved.')).toBeVisible();
    const saved = await records(page);
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map(value => value.id)).size).toBe(2);
});

for (const edited of [false, true]) {
test(`preserves input after a storage failure and retries ${edited ? 'with corrected sell values' : 'unchanged'} exactly once`, async ({ page }) => {
    await seed(page);
    await fill(page);
    await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        let fail = true;
        IDBObjectStore.prototype.add = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
            if (this.name === 'transactions' && fail) {
                fail = false;
                throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
            }
            return original.call(this, value, key);
        };
    });
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByRole('form', { name: 'Create transaction' }).getByRole('alert')).toContainText('Your entries are unchanged');
    await expect(page.getByLabel('Quantity')).toHaveValue('1,25');
    await expect(page.getByLabel('Account')).toHaveValue('account-b');
    expect(await records(page)).toHaveLength(0);
    if (edited) {
        await page.getByLabel('Quantity').fill('2.5');
        await page.getByRole('radio', { name: 'Sell', exact: true }).check();
    }
    await page.getByRole('button', { name: edited ? 'Save transaction' : 'Retry save' }).click();
    await expect(page.getByText('Transaction saved.')).toBeVisible();
    const saved = await records(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ shares: edited ? 2.5 : 1.25, type: edited ? 1 : 0 });
});
}

test('revalidates a deleted account and lets the user select a valid one', async ({ page }) => {
    await seed(page);
    await fill(page);
    await removeReference(page, 'accounts', 'account-b');
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByText(/This account no longer exists/)).toBeVisible();
    expect(await records(page)).toHaveLength(0);
    await page.getByRole('button', { name: 'Reload accounts' }).click();
    await expect(page.getByRole('option', { name: 'Synthetic B' })).toHaveCount(0);
    await page.getByLabel('Account').selectOption('account-a');
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByText('Transaction saved.')).toBeVisible();
    expect((await records(page))[0].accountId).toBe('account-a');
});

test('rejects an instrument deleted after the form opened', async ({ page }) => {
    await seed(page);
    await fill(page);
    await removeReference(page, 'instruments', 'SYNTH');
    await page.getByRole('button', { name: 'Save transaction' }).click();
    await expect(page.getByRole('form', { name: 'Create transaction' }).getByRole('alert')).toContainText('This instrument is unavailable');
    expect(await records(page)).toHaveLength(0);
});
