import { DataTable } from 'playwright-bdd';
import { Customer } from '../../api/CustomersApi';
import { Keys, scenarioName } from '../../core/keys';
import { uniqueEmail } from '../../core/unique';
import { expect, Given, Then, When } from '../../fixtures/test';

// Steps of the customers API. They run on the scenario's browser context (context.request), so a scenario can mix
// them with GUI steps and both see the same session. Customers created here are deleted after the scenario.

Given('a customer named {string} exists', async ({ customersApi, data }, name: string) => {
  data.put(Keys.CUSTOMER, await customersApi.create({ name: scenarioName(data, name), email: uniqueEmail() }));
});

Given('these customers exist:', async ({ customersApi, data }, table: DataTable) => {
  for (const row of table.hashes()) {
    await customersApi.create({ name: scenarioName(data, row.name), email: row.email || uniqueEmail(), status: row.status || 'active' });
  }
});

When('I create a customer named {string} through the API', async ({ customersApi, data }, name: string) => {
  const response = await customersApi.createResponse({ name: scenarioName(data, name), email: uniqueEmail() });
  data.put(Keys.RESPONSE, response);
  if (response.ok()) {
    const customer = (await response.json()) as Customer;
    customersApi.track(customer.id);
    data.put(Keys.CUSTOMER, customer);
  }
});

When('I create a customer without an email through the API', async ({ customersApi, data }) => {
  // The body misses a required field on purpose, so the type is bypassed here only.
  data.put(Keys.RESPONSE, await customersApi.createResponse({ name: scenarioName(data, 'No Email') } as never));
});

When('I get that customer through the API', async ({ customersApi, data }) => {
  data.put(Keys.RESPONSE, await customersApi.getResponse(data.get(Keys.CUSTOMER).id));
});

When('I get the customer with id {int} through the API', async ({ customersApi, data }, id: number) => {
  data.put(Keys.RESPONSE, await customersApi.getResponse(id));
});

When('I change the status of that customer to {string}', async ({ customersApi, data }, status: string) => {
  const customer = data.get(Keys.CUSTOMER);
  data.put(Keys.CUSTOMER, await customersApi.update(customer.id, { name: customer.name, email: customer.email, status }));
});

When('I delete that customer through the API', async ({ customersApi, data }) => {
  data.put(Keys.RESPONSE, await customersApi.deleteResponse(data.get(Keys.CUSTOMER).id));
});

Then('the API responds with status {int}', async ({ data }, status: number) => {
  const response = data.get(Keys.RESPONSE);
  expect(response.status(), `${response.url()} (body: ${await response.text()})`).toBe(status);
});

Then('the response contains that customer with status {string}', async ({ data }, status: string) => {
  const body = (await data.get(Keys.RESPONSE).json()) as Customer;
  const customer = data.get(Keys.CUSTOMER);
  expect(body).toMatchObject({ id: customer.id, name: customer.name, email: customer.email, status });
});

Then('the response error says {string}', async ({ data }, detail: string) => {
  expect(JSON.stringify(await data.get(Keys.RESPONSE).json())).toContain(detail);
});

Then('the customer can be found by id with status {string}', async ({ customersApi, data }, status: string) => {
  const customer = data.get(Keys.CUSTOMER);
  expect(await customersApi.get(customer.id)).toMatchObject({ id: customer.id, name: customer.name, status });
});

Then('that customer no longer exists', async ({ customersApi, data }) => {
  expect((await customersApi.getResponse(data.get(Keys.CUSTOMER).id)).status()).toBe(404);
});
