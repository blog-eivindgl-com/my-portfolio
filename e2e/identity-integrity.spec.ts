import { expect, test } from '@playwright/test';

test('refuses corrupt retained history after restart without clearing synthetic evidence', async ({ page }) => {
    await page.goto('/backup');
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup', exact: true }).click()]);
    // The first export initializes a fresh synthetic context and its baseline.
    const evidence = await page.evaluate(() => new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('my-portfolio'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, tx = db.transaction(['outbox', 'localState'], 'readwrite');
            const state = tx.objectStore('localState').get('local'); let saved: any;
            state.onsuccess = () => { saved = state.result; tx.objectStore('outbox').delete(saved.headRevision); };
            tx.oncomplete = () => { db.close(); resolve(saved); }; tx.onabort = () => reject(tx.error);
        };
    }));
    await page.reload();
    await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Identity/history integrity check failed');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Do not clear browser storage');
    const after = await page.evaluate(() => new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('my-portfolio'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, tx = db.transaction(['outbox', 'localState'], 'readonly');
            const state = tx.objectStore('localState').get('local'), count = tx.objectStore('outbox').count();
            tx.oncomplete = () => { db.close(); resolve({ state: state.result, count: count.result, version: db.version }); };
        };
    }));
    expect(after).toEqual({ state: evidence, count: 0, version: 30 });
});
