import { expect, Page, test } from '@playwright/test';
import { instrumentId, restoreExperiment } from './helpers/experiment-fixture';

async function seed(page: Page, crossAccount: boolean) {
    await page.clock.setFixedTime(new Date('2023-05-19T12:00:00Z'));
    const trade = (id: string, accountId: string, day: number, price: number, type = 0) => ({
        id, accountId, date: Date.UTC(2023, 0, day), instrumentId, shares: 10, price, type, brokerage: 0, description: '',
    });
    await restoreExperiment(page, [trade('a-buy', 'A', 1, 100), ...(crossAccount ? [trade('b-buy', 'B', 2, 200), trade('a-sell', 'A', 3, 120, 1)] : [])], [
        { id: 'past', instrumentId, date: Date.UTC(2023, 4, 18, 12), price: 110 },
        { id: 'future', instrumentId, date: Date.UTC(2023, 4, 19, 13), price: 999 },
    ]);
    await page.goto('/stock/transactions/' + instrumentId);
}

test('cross-account positions reconcile without mixing their costs', async ({ page }) => {
    await seed(page, true);
    await expect(page.getByRole('group', { name: 'Realized win', exact: true }).getByText('200', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Investment', exact: true }).getByText('2000', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Shares', exact: true }).getByText('10', { exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Account ID', exact: true })).toBeVisible();
});

test('shows the eligible quote and its age rather than the nearer future quote', async ({ page }) => {
    await seed(page, false);
    await expect(page.getByRole('group', { name: /^Price / }).getByText('110', { exact: true })).toBeVisible();
    await expect(page.getByText(/Recorded quote.*1 days old/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Unrealized win', exact: true }).getByText('100', { exact: true })).toBeVisible();
});
