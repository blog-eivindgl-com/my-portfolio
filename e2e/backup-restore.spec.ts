import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import fixture from '../test-fixtures/backup/portfolio-v2.json';
import oldFixture from '../test-fixtures/backup/portfolio-v1.json';
import { canonicalRecords, createBackup, parseBackup, PortfolioRecords } from '../src/app/services/backupFormat';

const source = JSON.stringify(fixture);
function encode(records: PortfolioRecords) {
    const backup = createBackup(records);
    backup.identity.entities = backup.identity.entities.map(entity => ({ ...entity, entityId: fixture.identity.entities.find(row => row.key === entity.key)?.entityId || entity.entityId }));
    return JSON.stringify(backup);
}
const tables = ['accounts', 'stocks', 'transactions', 'stockPrices'];

async function initialize(page: Page, seed = true) {
    await page.goto('/stock/transactions/SYNTH/create');
    await expect(page.getByText(/No accounts yet/)).toBeVisible();
    await page.goto('/backup');
    if (seed) {
        await preview(page);
        await confirmRecovery(page);
        await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
        await expect(page.getByText(/Restore complete/)).toBeVisible();
    }
    await page.goto('/backup');
}

async function records(page: Page): Promise<PortfolioRecords> {
    return page.evaluate(tables => new Promise<PortfolioRecords>((resolve, reject) => {
        const request = indexedDB.open('my-portfolio');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(tables, 'readonly');
            const result: Record<string, unknown[]> = {};
            tables.forEach(name => { const get = tx.objectStore(name).getAll(); get.onsuccess = () => { result[name] = get.result; }; });
            tx.oncomplete = () => { db.close(); resolve(result as unknown as PortfolioRecords); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }), tables);
}

async function download(page: Page, name: string) {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
    const path = await file.path();
    if (!path) throw new Error('Synthetic download did not complete.');
    return readFile(path, 'utf8');
}

async function preview(page: Page, content = source, mode = 'replace') {
    await page.getByLabel('Backup JSON file').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(page.getByText(/File loaded/)).toBeVisible();
    await page.getByLabel('Restore mode', { exact: true }).selectOption(mode);
    await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
}

async function confirmRecovery(page: Page, replacement = true) {
    const recovery = await download(page, 'Download recovery backup');
    await page.getByLabel('I verified that the recovery backup file is saved.').check();
    if (replacement) await page.getByLabel(/I understand replacement/).check();
    return recovery;
}

test('exports and restores exactly into a fresh browser context', async ({ page, browser }, info) => {
    await initialize(page);
    const exported = await download(page, 'Export backup');
    expect(canonicalRecords(parseBackup(exported).records)).toBe(canonicalRecords(parseBackup(source).records));
    const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:3100', timezoneId: info.project.use.timezoneId, locale: info.project.use.locale });
    try {
        const restored = await fresh.newPage();
        await initialize(restored, false);
        await preview(restored, exported);
        await confirmRecovery(restored);
        await restored.getByRole('button', { name: 'Apply restore', exact: true }).click();
        await expect(restored.getByText(/Restore complete/)).toBeVisible();
        await restored.reload();
        const reexported = await download(restored, 'Export backup');
        expect(canonicalRecords(parseBackup(reexported).records)).toBe(canonicalRecords(parseBackup(exported).records));
    } finally { await fresh.close(); }
});

test('cancellation writes nothing; replacement requires confirmation and its recovery file restores the original', async ({ page }) => {
    await initialize(page);
    const before = canonicalRecords(await records(page));
    const replacement = encode({ accounts: [{ id: 'replacement', name: 'Synthetic replacement' }], stocks: [], transactions: [], stockPrices: [] });
    await preview(page, replacement);
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled();
    expect(canonicalRecords(await records(page))).toBe(before);
    await page.getByRole('button', { name: 'Cancel restore' }).click();
    expect(canonicalRecords(await records(page))).toBe(before);
    await preview(page, replacement);
    const recovery = await download(page, 'Download recovery backup');
    expect(canonicalRecords(parseBackup(recovery).records)).toBe(before);
    await page.getByLabel('I verified that the recovery backup file is saved.').check();
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled();
    await page.getByLabel(/I understand replacement/).check();
    await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
    expect((await records(page)).accounts).toHaveLength(1);
    await page.getByRole('button', { name: 'Choose another backup' }).click();
    await preview(page, recovery);
    await confirmRecovery(page);
    await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
    expect(canonicalRecords(await records(page))).toBe(before);
});

for (const [label, content] of [['malformed', '{'], ['old format', JSON.stringify(oldFixture)], ['newer format', JSON.stringify({ ...fixture, formatVersion: 99 })]]) {
    test(`rejects ${label} imports without changing records`, async ({ page }) => {
        await initialize(page);
        const before = canonicalRecords(await records(page));
        await preview(page, content);
        await expect(page.locator('main').getByRole('alert')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toHaveCount(0);
        expect(canonicalRecords(await records(page))).toBe(before);
    });
}

test('merge blocks conflicts and a repeated identical merge creates no duplicate records', async ({ page }) => {
    await initialize(page);
    const before = canonicalRecords(await records(page));
    const conflict = JSON.stringify({ ...fixture, records: { ...fixture.records, accounts: fixture.records.accounts.map(row => ({ ...row, name: 'Changed synthetic name' })) } });
    await preview(page, conflict, 'merge');
    await expect(page.getByText(/conflicting record identities block merge/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled();
    expect(canonicalRecords(await records(page))).toBe(before);
    await preview(page, source, 'merge');
    await expect(page.getByText('9 identical records will be skipped.')).toBeVisible();
    await confirmRecovery(page, false);
    await page.getByRole('button', { name: 'Apply restore', exact: true }).dblclick();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
    expect(canonicalRecords(await records(page))).toBe(before);
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toHaveCount(0);
});

test('reports empty files without leaving an unexplained disabled preview', async ({ page }) => {
    await initialize(page);
    const before = canonicalRecords(await records(page));
    await page.getByLabel('Backup JSON file').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('') });
    await expect(page.locator('main').getByRole('alert')).toContainText('backup file is empty');
    await expect(page.getByRole('button', { name: 'Preview restore', exact: true })).toBeDisabled();
    expect(canonicalRecords(await records(page))).toBe(before);
});

test('another tab invalidates the preview and recovery confirmation before a new snapshot can be applied', async ({ page, context }) => {
    await initialize(page);
    await preview(page);
    const oldRecovery = await confirmRecovery(page);
    const other = await context.newPage();
    await other.goto('/backup');
    await other.goto('/accounts/create');
    await other.getByLabel('Name:', { exact: true }).fill('Synthetic other tab');
    await other.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(async () => (await records(other)).accounts.length).toBe(3);
    await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('changed after preview');
    expect((await records(page)).accounts).toHaveLength(3);
    await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled();
    const newRecovery = await confirmRecovery(page);
    expect(parseBackup(oldRecovery).records.accounts).toHaveLength(2);
    expect(parseBackup(newRecovery).records.accounts).toHaveLength(3);
    await page.getByRole('button', { name: 'Cancel restore' }).click();
    expect((await records(page)).accounts).toHaveLength(3);
    await other.close();
});

test('partial replacement failure rolls back every store, preserves the preview, and retries without duplicates', async ({ page }) => {
    await initialize(page);
    const before = canonicalRecords(await records(page));
    const changed = encode({ ...fixture.records, accounts: [...fixture.records.accounts, { id: 'new', name: 'Synthetic new' }] });
    await preview(page, changed);
    await confirmRecovery(page);
    await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        let fail = true;
        IDBObjectStore.prototype.add = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
            if (this.name === 'stockPrices' && fail) { fail = false; throw new DOMException('Synthetic failure after earlier writes', 'QuotaExceededError'); }
            return add.call(this, value, key);
        };
    });
    await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('No partial restore');
    expect(canonicalRecords(await records(page))).toBe(before);
    await page.getByRole('button', { name: 'Apply restore', exact: true }).dblclick();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
    expect((await records(page)).accounts).toHaveLength(3);
    expect((await records(page)).transactions).toHaveLength(3);
});

test('a failed recovery download cannot enable restore and can be retried', async ({ page }) => {
    await initialize(page);
    await preview(page);
    await page.evaluate(() => {
        const original = URL.createObjectURL;
        URL.createObjectURL = function () {
            URL.createObjectURL = original;
            throw new Error('Synthetic download failure');
        };
    });
    await page.getByRole('button', { name: 'Download recovery backup' }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('I verified that the recovery backup file is saved.')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled();
    await confirmRecovery(page);
    await expect(page.getByRole('button', { name: 'Apply restore', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancel restore' }).click();
});

test('recovery-only archives preserve malformed values and cannot bypass validated restore', async ({ page }) => {
    await initialize(page);
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('my-portfolio');
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('transactions', 'readwrite');
            const store = tx.objectStore('transactions');
            const get = store.get('synthetic-buy-a');
            get.onsuccess = () => store.put({ ...get.result, shares: NaN, order: 3 });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(tx.error); };
        };
    }));
    await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await page.getByText('Preserve historical or invalid records', { exact: true }).click();
    const raw = await download(page, 'Export recovery-only archive');
    expect(JSON.parse(raw).directlyImportable).toBe(false);
    expect(raw).toContain('NaN');
    await preview(page, raw);
    await expect(page.locator('main').getByRole('alert')).toContainText('not a directly importable');
    expect(Number.isNaN((await records(page)).transactions.find(row => row.id === 'synthetic-buy-a')?.shares)).toBe(true);
});
