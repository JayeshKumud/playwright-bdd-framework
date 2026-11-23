import { test as bddTest, createBdd } from 'playwright-bdd';
import { ApiLog } from '../api/ApiLog';
import { CustomersApi } from '../api/CustomersApi';
import { env } from '../config/env';
import { Cleanup } from '../core/Cleanup';
import { ScenarioData } from '../core/ScenarioData';
import { BackendMock } from '../mock/BackendMock';
import { AmqpMessageClient } from '../mq/AmqpMessageClient';
import { MessageClient } from '../mq/MessageClient';
import { CustomersAppPage } from '../pages/CustomersAppPage';
import { CustomersPage } from '../pages/CustomersPage';
import { UiState, WindowNavigator } from '../pages/WindowNavigator';

/** What a scenario's steps can ask for, besides Playwright's own fixtures (page, context, ...). */
type ScenarioFixtures = {
  /** Data the steps of the scenario share, under typed keys (core/keys.ts). */
  data: ScenarioData;
  /** Clean-up actions for resources outside the browser (messages, files ...), run after the scenario. */
  cleanup: Cleanup;
  /** Which window the scenario is on; no browser of its own, so hooks can read it in API/MQ-only scenarios. */
  ui: UiState;
  /** Moves between the app's windows (popups). */
  windows: WindowNavigator;
  customersPage: CustomersPage;
  customersAppPage: CustomersAppPage;
  /** The API calls of the scenario, attached to the report when it fails. */
  apiLog: ApiLog;
  /** The customers API, on the scenario's browser context: same cookies and session as the GUI steps. */
  customersApi: CustomersApi;
  /** Mocks the backend the frontend calls, for frontend tests before the backend is ready. */
  backendMock: BackendMock;
};

type WorkerFixtures = {
  /** ActiveMQ over AMQP 1.0; one connection per worker, opened on first use, closed when the worker ends. */
  mq: MessageClient;
};

const failed = (info: { status?: string; expectedStatus: string }) => info.status !== info.expectedStatus;

/**
 * The framework's test object: Playwright's test (via playwright-bdd) extended with the fixtures above. Each
 * scenario gets new instances, so parallel scenarios share nothing. A fixture is only created when a step or hook
 * asks for it: an API-only scenario never starts a browser page, an MQ-only one never opens a browser at all.
 */
export const test = bddTest.extend<ScenarioFixtures, WorkerFixtures>({
  data: async ({}, use) => {
    await use(new ScenarioData());
  },

  cleanup: async ({}, use, testInfo) => {
    const cleanup = new Cleanup();
    await use(cleanup);
    const failures = await cleanup.runAll();
    if (failures.length) await testInfo.attach('clean-up failures', { body: failures.join('\n'), contentType: 'text/plain' });
  },

  ui: async ({}, use) => {
    await use(new UiState());
  },

  // Playwright's page, registered as the scenario's first window as soon as anything uses it.
  page: async ({ page, ui }, use) => {
    ui.current ??= page;
    await use(page);
  },

  windows: async ({ page, ui }, use, testInfo) => {
    const windows = new WindowNavigator(page, ui);
    await use(windows);
    // Torn down before the page closes: a full-page screenshot of the window the scenario ended on.
    if (failed(testInfo) && !windows.current.isClosed()) {
      const png = await windows.current.screenshot({ fullPage: true }).catch(() => undefined);
      if (png) await testInfo.attach('failure screenshot', { body: png, contentType: 'image/png' });
    }
  },

  customersPage: async ({ windows }, use) => {
    await use(new CustomersPage(windows.first));
  },

  customersAppPage: async ({ windows }, use) => {
    await use(new CustomersAppPage(windows.first));
  },

  apiLog: async ({}, use, testInfo) => {
    const log = new ApiLog();
    await use(log);
    if (failed(testInfo) && log.calls.length) {
      await testInfo.attach('api calls', { body: log.toString(), contentType: 'text/plain' });
    }
  },

  customersApi: async ({ context, apiLog }, use, testInfo) => {
    const api = new CustomersApi(context.request, apiLog);
    await use(api);
    // Torn down before the context closes, so the deletes still have the scenario's session.
    const failures = await api.deleteTracked();
    if (failures.length) await testInfo.attach('clean-up failures', { body: failures.join('\n'), contentType: 'text/plain' });
  },

  backendMock: async ({ context }, use) => {
    await use(new BackendMock(context, env.baseUrl));
  },

  mq: [
    async ({}, use) => {
      const client = new AmqpMessageClient(env.mq);
      await use(client);
      await client.close();
    },
    { scope: 'worker' },
  ],
});

export const { Given, When, Then, Step, Before, After, BeforeStep, AfterStep } = createBdd(test);
export { expect } from '@playwright/test';

/**
 * After every step: a screenshot of the window the scenario is on (not always the first window), when
 * SCREENSHOT_EVERY_STEP is on and the scenario has opened a page. API and MQ steps before any page get none.
 */
AfterStep(async ({ ui, $testInfo, $step }) => {
  if (!env.screenshotEveryStep || !ui.current || ui.current.isClosed()) return;
  if (ui.current.url() === 'about:blank') return; // nothing opened yet, for example after an API step
  const png = await ui.current.screenshot().catch(() => undefined);
  if (png) await $testInfo.attach($step.title || 'step', { body: png, contentType: 'image/png' });
});
