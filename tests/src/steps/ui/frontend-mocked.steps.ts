import { DataTable } from 'playwright-bdd';
import { expect, Given, Then, When } from '../../fixtures/test';

// Steps for testing a frontend against a mocked backend (BackendMock): no backend has to exist. The example uses
// the demo frontend in mocks/demo-frontend; for your own frontend, keep the mock steps and use its page object.

Given('the demo frontend is served', async ({ customersAppPage }) => {
  await customersAppPage.serveDemo();
});

Given('the backend is mocked with {string}', async ({ backendMock }, mockFile: string) => {
  await backendMock.blockUnmocked('**/api/**'); // added first, so the mocks below win over it
  await backendMock.useFile(mockFile);
});

Given(
  'the backend answers {word} {string} with status {int}',
  async ({ backendMock }, method: string, url: string, status: number) => {
    await backendMock.mock({ method, url, status, json: { detail: `mocked ${status}` } });
  },
);

When('I open the customers app', async ({ customersAppPage }) => {
  await customersAppPage.open();
});

When('I add the customer {string} with email {string} in the app', async ({ customersAppPage }, name: string, email: string) => {
  await customersAppPage.addCustomer(name, email);
});

Then('the app shows the customers', async ({ customersAppPage }, table: DataTable) => {
  const grid = await customersAppPage.grid().waitUntilLoaded();
  const expected = table.hashes();
  expect(await grid.columnValues('Name')).toEqual(expected.map((r) => r.Name));
  for (const row of expected) {
    await expect(await grid.cell('Name', row.Name, 'Status')).toHaveText(row.Status);
  }
});

Then('the app status says {string}', async ({ customersAppPage }, text: string) => {
  await expect(customersAppPage.status()).toHaveText(text);
});

Then(
  'the frontend sent {word} {string} with {string} = {string}',
  async ({ backendMock }, method: string, url: string, field: string, value: string) => {
    await expect.poll(() => backendMock.calls(method, url).length, `${method} ${url} was called`).toBeGreaterThan(0);
    const body = backendMock.calls(method, url).at(-1)!.body as Record<string, unknown>;
    expect(String(body?.[field])).toBe(value);
  },
);

Then('the frontend called no unmocked backend endpoint', async ({ backendMock }) => {
  expect(backendMock.unmockedCalls()).toEqual([]);
});
