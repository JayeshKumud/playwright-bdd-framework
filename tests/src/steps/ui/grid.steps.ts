import { DataTable } from 'playwright-bdd';
import { scenarioName } from '../../core/keys';
import { ScenarioData } from '../../core/ScenarioData';
import { RowMatch, sameValue } from '../../pages/GridLibrary';
import { expect, Then, When } from '../../fixtures/test';

// Steps for the data grid (GridLibrary), the same as agentic-qa-java's GridSteps. Columns are named by their header
// text; values as shown (numbers by value: 70 is 70.00). Names in the "Name" column are made unique per scenario ("Ada Lovelace" becomes
// "Ada Lovelace 3f9c2a1b"), like the rest of the customers steps.
//
//   Then the grid is loaded
//   Then the grid column "Name" contains "Ada Lovelace"
//   Then the grid column "Name" does not contain "Nobody"
//   Then the grid column "Name" shows
//     | Ada Lovelace |
//     | Alan Turing  |
//
// A row is found by one or more columns: the step ends in "matching" and the columns and values follow as a
// two-column table (header | value). Every row that shows all of them is used: check, uncheck and the checks work
// on each of those rows, a click clicks the first:
//
//   Then in the grid rows matching, "Status" is "inactive"
//     | Name  | Alan Turing |
//     | Email | alan@x.org  |
//   When I check the grid rows matching
//   When I uncheck the grid rows matching
//   When I check "Select" in the grid rows matching
//   Then the grid rows matching are checked
//   Then the grid rows matching are not checked
//   When I click "Email" in the grid rows matching
//   When I click the "button" in the grid rows matching
//   When I click the "link" in column "Customer" of the grid rows matching
//
// The element type is checkbox, radio, button, link, input, dropdown or image, or a CSS selector such as
// "[data-testid='edit']".

const CHECKBOX = 'checkbox';

Then('the grid is loaded', async ({ customersPage }) => {
  await customersPage.grid().waitUntilLoaded();
});

Then('the grid column {string} contains {string}', async ({ customersPage, data }, header: string, value: string) => {
  const grid = customersPage.grid();
  expect(await grid.contains(header, unique(data, header, value)), `grid column "${header}" shows "${value}"`).toBe(true);
});

Then(
  'the grid column {string} does not contain {string}',
  async ({ customersPage, data }, header: string, value: string) => {
    const grid = await customersPage.grid().waitUntilLoaded();
    await expect(
      await grid.cells(header, unique(data, header, value)),
      `grid column "${header}" should not show "${value}"`,
    ).toHaveCount(0);
  },
);

Then('the grid column {string} shows', async ({ customersPage, data }, header: string, table: DataTable) => {
  const grid = await customersPage.grid().waitUntilLoaded();
  for (const [value] of table.raw()) {
    expect(await grid.contains(header, unique(data, header, value)), `grid column "${header}" shows "${value}"`).toBe(
      true,
    );
  }
});

Then(
  'in the grid rows matching, {string} is {string}',
  async ({ customersPage, data }, targetHeader: string, expected: string, table: DataTable) => {
    const grid = await customersPage.grid().waitUntilLoaded();
    const match = rowMatch(data, table);
    const values = await grid.values(match, targetHeader);
    expect(values.length, `a "${targetHeader}" cell in the grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    const want = unique(data, targetHeader, expected);
    for (const actual of values) {
      expect(
        sameValue(actual, want),
        `"${targetHeader}" in the grid rows matching ${describe(match)} shows "${actual}", expected "${want}"`,
      ).toBe(true);
    }
  },
);

When(
  'I check the grid rows matching',
  async ({ customersPage, data }, table: DataTable) => {
    const match = rowMatch(data, table);
    const grid = await customersPage.grid().waitUntilLoaded();
    const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
    expect(checkboxes.length, `a checkbox in the grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    for (const checkbox of checkboxes) {
      await checkbox.check();
      await expect(checkbox, `checkbox in the grid rows matching ${describe(match)} is checked`).toBeChecked();
    }
  },
);

When(
  'I uncheck the grid rows matching',
  async ({ customersPage, data }, table: DataTable) => {
    const match = rowMatch(data, table);
    const grid = await customersPage.grid().waitUntilLoaded();
    const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
    expect(checkboxes.length, `a checkbox in the grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    for (const checkbox of checkboxes) {
      await checkbox.uncheck();
      await expect(checkbox, `checkbox in the grid rows matching ${describe(match)} is unchecked`).not.toBeChecked();
    }
  },
);

When(
  'I check {string} in the grid rows matching',
  async ({ customersPage, data }, checkboxHeader: string, table: DataTable) => {
    const match = rowMatch(data, table);
    const grid = await customersPage.grid().waitUntilLoaded();
    const checkboxes = await (await grid.elements(match, CHECKBOX, checkboxHeader)).all();
    expect(checkboxes.length, `a checkbox in the grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    for (const checkbox of checkboxes) {
      await checkbox.check();
      await expect(checkbox, `"${checkboxHeader}" checkbox in the grid rows matching ${describe(match)} is checked`).toBeChecked();
    }
  },
);

Then(
  'the grid rows matching are checked',
  async ({ customersPage, data }, table: DataTable) => {
    const match = rowMatch(data, table);
    const grid = await customersPage.grid().waitUntilLoaded();
    const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
    expect(checkboxes.length, `a checkbox in the grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    for (const checkbox of checkboxes) {
      await expect(checkbox, `checkbox in the grid rows matching ${describe(match)} is checked`).toBeChecked();
    }
  },
);

Then(
  'the grid rows matching are not checked',
  async ({ customersPage, data }, table: DataTable) => {
    const match = rowMatch(data, table);
    const grid = await customersPage.grid().waitUntilLoaded();
    const checkboxes = await (await grid.elements(match, CHECKBOX)).all();
    expect(checkboxes.length, `a checkbox in the grid rows matching ${describe(match)}`).toBeGreaterThan(0);
    for (const checkbox of checkboxes) {
      await expect(checkbox, `checkbox in the grid rows matching ${describe(match)} is not checked`).not.toBeChecked();
    }
  },
);

When('I click {string} in the grid rows matching', async ({ customersPage, data }, targetHeader: string, table: DataTable) => {
  const grid = await customersPage.grid().waitUntilLoaded();
  await (await grid.cells(rowMatch(data, table), targetHeader)).first().click();
});

When(
  'I click the {string} in the grid rows matching',
  async ({ customersPage, data }, elementType: string, table: DataTable) => {
    const match = rowMatch(data, table);
    const found = await (await customersPage.grid().waitUntilLoaded()).elements(match, elementType);
    await expect(found.first(), `a ${elementType} in the grid rows matching ${describe(match)}`).toBeVisible();
    await found.first().click();
  },
);

When(
  'I click the {string} in column {string} of the grid rows matching',
  async ({ customersPage, data }, elementType: string, targetHeader: string, table: DataTable) => {
    const match = rowMatch(data, table);
    const found = await (await customersPage.grid().waitUntilLoaded()).elements(match, elementType, targetHeader);
    await expect(
      found.first(),
      `a ${elementType} in column "${targetHeader}" of the grid rows matching ${describe(match)}`,
    ).toBeVisible();
    await found.first().click();
  },
);

/** A | header | value | table as a grid row match, with names made unique for the scenario. */
function rowMatch(data: ScenarioData, table: DataTable): RowMatch {
  return Object.fromEntries(table.raw().map(([header, value]) => [header, unique(data, header, value)]));
}

/** The value as the grid shows it: a "Name" is made unique for the scenario, anything else is kept. */
function unique(data: ScenarioData, header: string, value: string): string {
  return header === 'Name' ? scenarioName(data, value) : value;
}

/** `"Name" is "COE" and "Role" is "Admin"`, for messages. */
function describe(match: RowMatch): string {
  return Object.entries(match)
    .map(([header, value]) => `"${header}" is "${value}"`)
    .join(' and ');
}
