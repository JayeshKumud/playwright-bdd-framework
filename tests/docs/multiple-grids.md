# Several grids on one page

Some windows of the real application show two AG Grids at once, both visible and side by side or one above the
other. The grid steps and [`GridLibrary`](../src/pages/GridLibrary.ts) work on **one grid at a time**, and on such
a window you say which one: by a column that only that grid has, or, when the grids show the same columns, by the
element the grid is in. The same as agentic-qa-java (its `docs/multiple-grids.md`).

```gherkin
When I open the Price Booking window
And I use the grid with column "Booking"        # the grid that has a Booking column
Then the Price grid is loaded
When I check the Price grid rows matching
  | Booking | Booking A |
And I use the grid with column "Customer"       # now the other grid
Then in the Price grid rows matching, "Status" is "Open"
  | Customer | Ada |
```

## Why a grid has to be picked

Every lookup of `GridLibrary` (the header, column keys, rows, cells, values and the waits) searches inside one
grid element, its **root** (`root` in the grid's locator file; AG Grid's `.ag-root-wrapper` in
[`locators/grid.ag-grid.json`](../src/pages/locators/grid.ag-grid.json)). AG Grid puts the header, the rows and the
loading overlay inside that element, so one locator file works for every AG Grid.

With two grids, `.ag-root-wrapper` finds two elements, and rows are found by their `row-index`: both grids have a
row 0, so a page-wide lookup would mix the rows of the two grids without any error. A lookup can only reach the
picked grid.

| Window has | `price.grid()` is |
|---|---|
| one grid | that grid; nothing to pick, and nothing changes for these windows |
| several grids, one picked | the picked grid |
| several grids, none picked | an error at `waitUntilLoaded()` that says to pick one |

## In feature files

| Step | Does |
|---|---|
| `When I use the grid with column "Booking"` | picks the current window's AG Grid that has a column with that header, and waits until it has loaded |
| `When I use the grid in "bookingsGrid"` | picks the grid in an element of the window: `bookingsGrid` is a locator in the current window's locator file ([below](#grids-with-the-same-columns-pick-by-container)); waits until it has loaded |
| `When I use the only grid` | goes back to the window's single grid (clears a column or a container choice) |

All are in [`grid.steps.ts`](../src/steps/ui/grid.steps.ts). After `I use the grid with column` or `I use the grid in`, every
`GridLibrary` created for **that window** is the picked grid:

- the Price grid steps ([`price.steps.ts`](../src/steps/ui/price.steps.ts)): `the Price grid is loaded`, `I check
  the Price grid rows matching`, `the Price grid rows matching have ... in column ...`, ...
- the `PricePage` methods those steps call (`elementsInCell`, `verifySelectionShown`, `checkboxesWithPriceDiv`,
  ...), because they use `this.grid()`.

No step text changes: the steps you already have keep working, on the grid you picked.

The general grid steps (`the grid is loaded`, `the grid column ... contains ...`, `I check the grid rows matching`,
...) work on the customers page of the first window (`customersPage.grid()`, a plain `<table>`), as before. They
follow a choice only if it was made on the first window. `I use the grid with column` checks the grid with the AG
Grid locator file, so use it on AG Grid windows such as Price Booking.

### How long a choice lasts

The choice belongs to **the window** (the Playwright `Page`) it was made on:

- It stays until you pick another grid (by column or by container: the newer choice replaces the other), or
  `I use the only grid`, on that window.
- Other windows keep their own choice, so after `I go back to the "Price Booking" window` the Price window's grid
  is the one picked there earlier.
- When a window's page is replaced in place (opening Unique Window from Price Booking loads it into the same
  browser window), the choice is dropped: it was for the old page's grid.
- It ends with the scenario: each scenario has its own windows, and the choice is kept in a `WeakMap` keyed by
  the window. Parallel workers are separate processes and never share one.

### Choosing the column

Pick a column that **only that grid** has, and write its header exactly as shown (case and spaces count):

| Grids | Booking grid's columns | Customer grid's columns | Pick with |
|---|---|---|---|
| Booking and Customer | Booking, Status, Price | Customer, Status | `"Booking"` or `"Price"` for the first, `"Customer"` for the second; **not** `"Status"` |

`I use the grid with column` waits for the grid at once, so a wrong choice fails at that step, not later:

| Message | Means | Fix |
|---|---|---|
| `2 grids have a "Status" column on <url>: pick the grid by a column only it has, or by its container ...` | both grids have that column | pick a column only one of them has, or [pick by container](#grids-with-the-same-columns-pick-by-container) |
| `the grid with the column "Bookings" is shown` (expect timeout) | no grid has that column (yet) | check the header text; open the tab or panel that shows the grid first |
| `2 grids on <url>: pick one by a column only it has, with the step 'I use the grid with column "Booking"' or price.grid('Booking')` | a grid step ran on a window with two grids, and none was picked | add `I use the grid with column "..."` or `I use the grid in "..."` before it |

## In code

```ts
const price = new PricePage(await windows.window(PricePage.TITLE));
const grid = price.grid();                                // the only grid, or the one picked for the window
const bookings = price.grid('Booking');                   // the grid with a Booking column, whatever was picked
const inPanel = price.gridIn('bookingsGrid');             // the grid in the bookingsGrid element of price.json
new GridLibrary(page, undefined, 'Booking');              // the same, without a page object (AG Grid locators)
new GridLibrary(page, undefined, { container: page.locator('#bookings'), name: '#bookings' }); // a container
new GridLibrary(page, tableLocators, 'Name');             // another locator file, picked by a column
```

Every function of a `GridLibrary` stays inside its grid:

```ts
const bookings = await price.grid('Booking').waitUntilLoaded();
await bookings.contains('Booking', 'Booking A');                     // waits for the value
const rows = await bookings.rows({ Booking: 'Booking A' });          // rows of this grid only
await bookings.values({ Booking: 'Booking A' }, 'Status');
for (const box of await (await bookings.elements({ Booking: 'Booking A' }, 'checkbox')).all()) await box.check();
await (await bookings.cellIn(rows, 'Price')).locator('span.something').count();
```

`grid('Booking')` always gives the grid with that column, `gridIn('bookingsGrid')` the grid in that element;
`grid()` follows the choice of the window. A step of
your own that uses `price.grid()` therefore follows `I use the grid with column` without any extra code:

```ts
When('I tick the {string} rows', async ({ windows }, booking: string) => {
  const price = new PricePage(await windows.window(PricePage.TITLE));
  const grid = await price.grid().waitUntilLoaded();                 // the picked grid
  for (const box of await (await grid.elements({ Booking: booking }, 'checkbox')).all()) await box.check();
});
```

### The grid element: `root()`

For anything `GridLibrary` has no function for, `root()` is the grid element itself, as a `Locator`. Searches from
it stay inside that grid:

```ts
const bookingsGrid = (await price.grid('Booking').waitUntilLoaded()).root();
await bookingsGrid.locator("button:has-text('Export')").click();     // that grid's Export button only
```

Call `waitUntilLoaded()` first when the grid may still be loading: `root()` does not wait. On a window with two
grids and nothing picked, `price.grid().root()` finds both, so pick one first.

### Picking a grid from code

The step stores the choice for the window; code can do the same:

```ts
import { chosenGridColumn, chosenGridContainer, useGrid, useGridIn } from '../../pages/GridLibrary';

useGrid(windows.current, 'Booking');      // like I use the grid with column "Booking"
useGridIn(windows.current, 'bookingsGrid', '#bookings'); // like I use the grid in "bookingsGrid" (name, selector)
useGrid(windows.current, undefined);      // like I use the only grid (clears both kinds)
chosenGridColumn(windows.current);        // the column picked for a window, or undefined
chosenGridContainer(windows.current);     // the container name picked for a window, or undefined
```

Prefer `price.grid('Booking')` or `price.gridIn('bookingsGrid')` in code: it says which grid it uses where it is
used.

## Grids with the same columns: pick by container

When both grids show exactly the same columns, no column tells them apart. Pick the grid by the element it is in
instead. Add that element to the window's locator file (for the Price window,
[`locators/price.json`](../src/pages/locators/price.json)):

```json
"bookingsGrid": { "selector": "#bookings", "description": "the panel around the Bookings grid" }
```

Then pick it:

```gherkin
When I use the grid in "bookingsGrid"
Then the Price grid is loaded
```

```ts
const bookings = await price.gridIn('bookingsGrid').waitUntilLoaded();
```

The locator can point at the element **around** the grid (a panel, a tab, a `div` with an id: `#bookings`) or at
the **grid element itself** (`#bookings .ag-root-wrapper`); either way the grid is the one in it.

The step finds the locator file by the current window's title: the `locators` of its entry in
[`Window.ts`](../src/pages/Window.ts) (Price Booking: `price.json`, Unique Window: `unique.json`). For another
window, add `locators` and `locatorsFile` to its entry. Unlike agentic-qa-java, where every page object has its
locator file, the TS steps work on windows (Playwright `Page`s), so this mapping is needed.

| Message | Means | Fix |
|---|---|---|
| `"bookingGrid" is not in the locators/price.json; add it there` | the name is not in the window's locator file | check the spelling, or add the locator |
| `No locator file is known for the window "<title>": add \`locators\` to its entry in src/pages/Window.ts ...` | the current window has no locator file in `Window.ts` | add it, or switch to the right window first |
| `the grid in "bookingsGrid" is shown` (expect timeout) | the element has no grid in it (yet), or the locator finds nothing | check the selector; open the tab or panel that shows the grid first |
| `2 grids in "bookingsGrid" on <url>: make its locator match the element around one grid only` | the element holds both grids, or the locator finds several elements | make the selector narrower |

`I use the grid in` checks the grid before keeping the choice, so a wrong name or container fails at that step and
leaves the earlier choice as it was.

## Locator files: selectors relative to the root

Every selector of a grid locator file except `root` is searched **inside the root**, so write them relative to it.
Playwright does not count the root itself when it searches inside it, so a selector that repeats the root's id
finds nothing:

| Key | Right | Wrong |
|---|---|---|
| `root` | `#customers-table` | |
| `header` | `thead` | `#customers-table thead` |
| `row` | `tbody tr.customer-row` | `#customers-table tbody tr.customer-row` |

[`grid.ag-grid.json`](../src/pages/locators/grid.ag-grid.json) and
[`grid.customers-table.json`](../src/pages/locators/grid.customers-table.json) are written this way.

## Limits

- **Grids with the same columns and no element of their own.** Picking by container needs an element that holds
  one grid only. If the app renders both grids in the same parent without ids or classes that tell them apart, a
  positional selector (`#panel > div:nth-child(2)`) works but breaks when the layout changes.
- **Nested grids.** AG Grid's master/detail rows put a grid inside a row of another. The outer grid's lookups would
  also find the inner grid's rows. The windows this was built for have side-by-side grids, not nested ones.
- **Hidden grids.** A grid in a closed tab or panel still counts: it has its columns and its root. If one of the
  two is hidden, pick the visible one by its column as usual.

## Checked how

There is no unit-test suite in this project (every test is a Cucumber feature). The behaviour was checked with a
temporary Playwright spec on a page with two visible AG-Grid-like grids that both have a row 0 (`page.setContent`,
no application needed), the same cases as agentic-qa-java's `GridLibraryTwoGridsTest`:

- `grid()` fails clearly when the page has two grids;
- each grid is found by its own column and returns only its own values;
- rows, cells, checkboxes and `root()` never reach the other grid;
- a column both grids have fails clearly;
- a page object's `grid()` follows the grid picked for its window, and "only grid" again fails clearly;
- the plain customers table still works with its relative selectors.

Picking by container and matching by shown text were checked the same way (6 passed, spec removed), the same cases
as agentic-qa-java's `GridLibraryContainerTest` and `GridLibraryShownTextTest`:

- two grids with the **same** columns, each found by its container, whether the locator is the element around it
  or the grid element itself;
- a column cannot pick them, and the message points to picking by container;
- a container with both grids and a container without a grid fail clearly;
- a container picked for the window is what `new GridLibrary(page)` uses; a column choice replaces it and the other
  way round; "only grid" clears it;
- cells match by the text they show (`innerText`: a hidden span is left out, `text-transform` applied), and inputs,
  textareas and dropdowns by their value; a checkbox next to a label is ignored.
