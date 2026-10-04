import { expect, Page } from '@playwright/test';
import { createBackup, PortfolioRecords } from '../../src/app/services/backupFormat';
export const instrumentId = '11111111-1111-4111-8111-111111111111';
export const otherInstrumentId = '22222222-2222-4222-8222-222222222222';
export const instruments = [
    { id: instrumentId, name: 'Synthetic share', ticker: 'SYNTH', instrumentKind: null, currency: null, exchange: null, isin: null },
    { id: otherInstrumentId, name: 'Synthetic fund', ticker: null, instrumentKind: null, currency: null, exchange: null, isin: null },
];
export async function restoreExperiment(page: Page, transactions: PortfolioRecords['transactions'], stockPrices: PortfolioRecords['stockPrices'], stocks = instruments) {
    const text = JSON.stringify(createBackup({ accounts: [{ id: 'A', name: 'Synthetic A' }, { id: 'B', name: 'Synthetic B' }], instruments: stocks, transactions, stockPrices }));
    await page.goto('/backup');
    await page.getByLabel('Backup JSON file').setInputFiles({ name: 'synthetic-experiment.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByText(/File loaded/)).toBeVisible();
    await page.getByLabel('Restore mode', { exact: true }).selectOption('replace');
    await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download recovery backup' }).click()]);
    await page.getByLabel('I verified that the recovery backup file is saved.').check();
    await page.getByLabel(/I understand replacement/).check();
    await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
}
