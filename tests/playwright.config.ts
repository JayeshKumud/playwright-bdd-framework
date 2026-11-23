import { defineConfig } from '@playwright/test';
import { cucumberReporter, defineBddConfig } from 'playwright-bdd';
import { env } from './src/config/env';

/**
 * The Cucumber features (features/**) are turned into Playwright tests by `bddgen` (into .features-gen) and run by
 * Playwright Test: parallel workers, retries, traces, videos and reports come from Playwright. The steps use the
 * fixtures of src/fixtures/test.ts (test.extend), so every scenario gets its own browser context, shared by its GUI
 * and API steps.
 */
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['src/fixtures/test.ts', 'src/steps/**/*.ts'],
  outputDir: '.features-gen',
  missingSteps: 'fail-on-gen',
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: env.workers,
  retries: env.retries,
  timeout: env.testTimeoutMs,
  expect: { timeout: env.expectTimeoutMs },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: true, environmentInfo: { env: env.name, baseUrl: env.baseUrl } }],
    cucumberReporter('html', { outputFile: 'reports/cucumber/report.html' }),
    cucumberReporter('json', { outputFile: 'reports/cucumber/report.json' }),
  ],
  use: {
    baseURL: env.baseUrl,
    headless: env.headless,
    viewport: env.viewport,
    actionTimeout: env.actionTimeoutMs,
    navigationTimeout: env.navigationTimeoutMs,
    // Screenshots are taken by the framework (src/fixtures/test.ts): after every step and on failure, of the
    // window the scenario is on, not only the first page.
    screenshot: 'off',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
