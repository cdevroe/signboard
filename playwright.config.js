const { defineConfig } = require('@playwright/test');
const { assertPlaywrightLaunchAllowed } = require('./scripts/playwright-safety');

assertPlaywrightLaunchAllowed();

module.exports = defineConfig({
  testDir: './tests/playwright',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'output/playwright/results.json' }]],
  outputDir: 'output/playwright/test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
