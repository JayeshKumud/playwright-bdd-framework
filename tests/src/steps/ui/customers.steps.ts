import { Keys, scenarioName, suffixOf } from '../../core/keys';
import { uniqueEmail } from '../../core/unique';
import { expect, Given, Then, When } from '../../fixtures/test';

// Steps of the customers page. Names in the features are made unique per scenario ("Ada Lovelace" becomes
// "Ada Lovelace 3f9c2a1b"), so parallel scenarios never see each other's customers.

Given('I am on the customers page', async ({ customersPage }) => {
  await customersPage.open();
});

When('I search the customers page for that customer', async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(data.get(Keys.CUSTOMER).name);
});

When("I search the customers page for this scenario's customers", async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(suffixOf(data));
});

When('I search the customers page for a name that matches nobody', async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(`nobody ${suffixOf(data)}`);
});

When('I add a customer named {string} through the form', async ({ customersPage, customersApi, data }, name: string) => {
  const unique = scenarioName(data, name);
  await customersPage.open();
  await customersPage.addCustomer(unique, uniqueEmail());
  // The form gives no id back: look it up, keep it for later steps, and have it deleted after the scenario.
  const [created] = await customersApi.findByName(unique);
  expect(created, `customer "${unique}" was created`).toBeDefined();
  customersApi.track(created.id);
  data.put(Keys.CUSTOMER, created);
});

Then('the results show only that customer with status {string}', async ({ customersPage, data }, status: string) => {
  const grid = await customersPage.grid().waitUntilLoaded();
  const customer = data.get(Keys.CUSTOMER);
  expect(await grid.columnValues('Name')).toEqual([customer.name]);
  await expect(await grid.cells({ Name: customer.name }, 'Status')).toHaveText(status);
});

Then('the customer appears in the customer list', async ({ customersPage, data }) => {
  const customer = data.get(Keys.CUSTOMER);
  await customersPage.search(customer.name);
  const grid = await customersPage.grid().waitUntilLoaded();
  await expect(await grid.cells({ Name: customer.name }, 'Email')).toHaveText(customer.email);
});

Then('the page says no customers were found', async ({ customersPage }) => {
  await expect(customersPage.noResultsMessage()).toHaveText('No customers found.');
});

Then('the page shows {string}', async ({ customersPage }, text: string) => {
  await expect(customersPage.pageIndicator()).toHaveText(text);
});
