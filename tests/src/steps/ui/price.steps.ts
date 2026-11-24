import { DataTable } from 'playwright-bdd';
import { RowMatch } from '../../pages/GridLibrary';
import { PricePage } from '../../pages/PricePage';
import { WindowNavigator } from '../../pages/WindowNavigator';
import { expect, Then, When } from '../../fixtures/test';

// Steps for the grid of the Price window, the same as agentic-qa-java's PriceSteps. They always work on the Price
// window's grid, whichever window the scenario is on (the Price window must be open). Rows are found by a
// two-column table (header | value); every row that shows all the values is used:
//
//   Then the Price grid is loaded
//   When I check the Price grid rows matching
//     | Booking | Booking A |
//     | Status  | Open      |
//   When I uncheck the Price grid rows matching
//   Then the Price grid rows matching are checked
//   Then the Price grid rows matching are not checked
//   Then in the Price grid rows matching, "Status" is "Open"
//   When I click the "link" in column "Customer" of the Price grid rows matching
//
// For the grid of the page the scenario is on, use grid.steps.ts.

const CHECKBOX = 'checkbox';

Then('the Price grid is loaded', async ({ windows }) => {
  await (await price(windows)).grid().waitUntilLoaded();
});

When('I check the Price grid rows matching', async ({ windows }, table: DataTable) => {
  const match = rowMatch(table);
  const grid = await (await price(windows)).grid().waitUntilLoaded();
  const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
  expect(checkboxes.length, `a checkbox in the Price grid rows matching ${describe(match)}`).toBeGreaterThan(0);
  for (const checkbox of checkboxes) {
    await checkbox.check();
    await expect(checkbox, `checkbox in the Price grid rows matching ${describe(match)} is checked`).toBeChecked();
  }
});

When('I uncheck the Price grid rows matching', async ({ windows }, table: DataTable) => {
  const match = rowMatch(table);
  const grid = await (await price(windows)).grid().waitUntilLoaded();
  const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
  expect(checkboxes.length, `a checkbox in the Price grid rows matching ${describe(match)}`).toBeGreaterThan(0);
  for (const checkbox of checkboxes) {
    await checkbox.uncheck();
    await expect(checkbox, `checkbox in the Price grid rows matching ${describe(match)} is unchecked`).not.toBeChecked();
  }
});

Then('the Price grid rows matching are checked', async ({ windows }, table: DataTable) => {
  const match = rowMatch(table);
  const grid = await (await price(windows)).grid().waitUntilLoaded();
  const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
  expect(checkboxes.length, `a checkbox in the Price grid rows matching ${describe(match)}`).toBeGreaterThan(0);
  for (const checkbox of checkboxes) {
    await expect(checkbox, `checkbox in the Price grid rows matching ${describe(match)} is checked`).toBeChecked();
  }
});

Then('the Price grid rows matching are not checked', async ({ windows }, table: DataTable) => {
  const match = rowMatch(table);
  const grid = await (await price(windows)).grid().waitUntilLoaded();
  const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
  expect(checkboxes.length, `a checkbox in the Price grid rows matching ${describe(match)}`).toBeGreaterThan(0);
  for (const checkbox of checkboxes) {
    await expect(checkbox, `checkbox in the Price grid rows matching ${describe(match)} is not checked`).not.toBeChecked();
  }
});

Then(
  'in the Price grid rows matching, {string} is {string}',
  async ({ windows }, targetHeader: string, expected: string, table: DataTable) => {
    const match = rowMatch(table);
    const grid = await (await price(windows)).grid().waitUntilLoaded();
    const values = await grid.values(match, targetHeader);
    expect(values.length, `a "${targetHeader}" cell in the Price grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    for (const actual of values) {
      expect(actual, `"${targetHeader}" in the Price grid rows matching ${describe(match)}`).toBe(expected);
    }
  },
);

When(
  'I click the {string} in column {string} of the Price grid rows matching',
  async ({ windows }, elementType: string, targetHeader: string, table: DataTable) => {
    const match = rowMatch(table);
    const grid = await (await price(windows)).grid().waitUntilLoaded();
    const found = await grid.elements(match, elementType, targetHeader);
    await expect(
      found.first(),
      `a ${elementType} in column "${targetHeader}" of the Price grid rows matching ${describe(match)}`,
    ).toBeVisible();
    await found.first().click();
  },
);

/** The Price window's page object: the open Price window, without switching to it. */
async function price(windows: WindowNavigator): Promise<PricePage> {
  return new PricePage(await windows.window(PricePage.TITLE));
}

/** A | header | value | table as a grid row match. */
function rowMatch(table: DataTable): RowMatch {
  return Object.fromEntries(table.raw().map(([header, value]) => [header, value]));
}

/** `"Booking" is "Booking A" and "Status" is "Open"`, for messages. */
function describe(match: RowMatch): string {
  return Object.entries(match)
    .map(([header, value]) => `"${header}" is "${value}"`)
    .join(' and ');
}
