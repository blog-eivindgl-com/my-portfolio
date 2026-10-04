import nextJest from 'next/jest.js';

// The service tests must not depend on the developer's clock or time zone.
process.env.TZ = 'UTC';
 
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});
 
// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
 
  testEnvironment: 'jest-environment-jsdom',
  fakeTimers: {
    enableGlobally: true,
    now: Date.UTC(2023, 4, 19, 12),
  },
  transformIgnorePatterns: [
    "node_modules/(?!dexie)"
  ]
};
 
// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
