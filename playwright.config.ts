import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 30_000,
    use: {
        baseURL: 'http://127.0.0.1:3100',
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'utc', use: { browserName: 'chromium', timezoneId: 'UTC', locale: 'en-US' } },
        { name: 'los-angeles', use: { browserName: 'chromium', timezoneId: 'America/Los_Angeles', locale: 'en-US' } },
        { name: 'oslo', use: { browserName: 'chromium', timezoneId: 'Europe/Oslo', locale: 'nb-NO' } },
    ],
    webServer: {
        command: 'yarn start --hostname 127.0.0.1 --port 3100',
        url: 'http://127.0.0.1:3100',
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
