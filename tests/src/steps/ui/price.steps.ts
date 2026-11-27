import { DataTable } from 'playwright-bdd';
import { RowMatch, sameValue } from '../../pages/GridLibrary';
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
//   Then in the Price grid rows matching, "Range" contains "TESTRANGE"
//   When I check "Unique" in the Price grid rows with a "PRICE1" Price div for the units
//     | TEST1 |
//     | TEST2 |
//   Then the "Price" cells of the Price grid rows matching show the "TEST1" selection
//   Then the Price grid rows matching have "span.something:text-is('TEST')" in column "Price"
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
      expect(
        sameValue(actual, expected),
        `"${targetHeader}" in the Price grid rows matching ${describe(match)} shows "${actual}", expected "${expected}"`,
      ).toBe(true);
    }
  },
);

// Ticks the checkbox in a column of the Price grid rows of the table's units (one per line) whose Price cell holds
// a div whose class contains the text (PricePage.checkboxesWithPriceDiv); a unit without such a row is skipped.
When(
  'I check {string} in the Price grid rows with a {string} Price div for the units',
  async ({ windows }, checkboxHeader: string, classPart: string, table: DataTable) => {
    const units = table.raw().map(([unit]) => unit);
    for (const checkbox of await (await price(windows)).checkboxesWithPriceDiv(units, classPart, checkboxHeader)) {
      await checkbox.check();
      await expect(
        checkbox,
        `"${checkboxHeader}" checkbox of a Price grid row of the units ${JSON.stringify(units)} with a ` +
          `"${classPart}" Price div is checked`,
      ).toBeChecked();
    }
  },
);

// Passes if a cell of the column, in the matching rows, contains the text: anywhere in the cell, case-sensitive
// (PricePage.cellContaining).
Then(
  'in the Price grid rows matching, {string} contains {string}',
  async ({ windows }, header: string, text: string, table: DataTable) => {
    await (await price(windows)).cellContaining(rowMatch(table), header, text);
  },
);

// The Splited column shows ranges such as "10->20": "10" or "20" matches either side, "10->20" only that range
// (PricePage.verifySelectionShown). TEST1 looks for the cell's model1 div, TEST2 for its model2 div.
Then(
  'the {string} cells of the Price grid rows matching show the {string} selection',
  async ({ windows }, targetHeader: string, selection: string, table: DataTable) => {
    await (await price(windows)).verifySelectionShown(rowMatch(table), selection, targetHeader);
  },
);

// An element a selector finds in a column of the matching rows (PricePage.elementsInCell), and visible:
//   Then the Price grid rows matching have "span.something:text-is('TEST')" in column "Price"
//     | Booking | Booking A |
// span.something = a span with the class something; :text-is('TEST') = text exactly TEST;
// :has-text('TEST') = text contains TEST, any case; span[class*='some'] = class contains some.
Then(
  'the Price grid rows matching have {string} in column {string}',
  async ({ windows }, selector: string, header: string, table: DataTable) => {
    const match = rowMatch(table);
    const found = await (await price(windows)).elementsInCell(match, header, selector);
    await expect(
      found.first(),
      `"${selector}" in column "${header}" of the Price grid rows matching ${describe(match)}`,
    ).toBeVisible();
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
