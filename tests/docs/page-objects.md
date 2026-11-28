# Page objects, windows and grids

Steps never use selectors. They call **page objects** (`CustomersPage`, `CustomersAppPage`), which look up
their elements by name in a [locator file](locators.md). Page objects are fixtures, so every step of a scenario
gets the same instance and a new scenario gets a new one.

```ts
When('I search the customers page for that customer', async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(data.get(Keys.CUSTOMER).name);
});
```

## Compared with the Java framework

| Java | Here |
|---|---|
| `Pages` injected by PicoContainer, `pages.customers()` | a fixture per page object: `customersPage` |
| `PageComponentsFactory.get(HomePage.class)` from any code | the fixture, asked for in the step |
| `TestSession.pageComponent(type, supplier)`: one instance per scenario, cached in a map | Playwright caches each fixture per scenario |
| `pageComponents.clear()` in `TestSession.close` | nothing: the fixture ends with the scenario |
| `PageComponents` interface, `(Page, Healer)` constructor | any class with a `(page: Page)` constructor |
| page created lazily, so API-only scenarios open no browser | same: the fixture is only created when a step asks for it |

## A page object

```ts
import locators from './locators/customers.json';

export class CustomersPage {
  static readonly PATH = '/';
  static readonly TITLE = 'Customer Management';

  private readonly el: PageElements;

  constructor(readonly page: Page) {
    this.el = new PageElements(page, locators, 'locators/customers.json');
  }

  async open(): Promise<this> {
    await this.page.goto(CustomersPage.PATH);       // relative to BASE_URL
    return this.verifyDisplayed();
  }

  async search(name: string): Promise<this> {
    await this.el.get('searchInput').fill(name);
    await Promise.all([this.page.waitForURL(/[?&]q=/), this.el.get('searchButton').click()]);
    return this;
  }

  noResultsMessage(): Locator {
    return this.el.get('noResults');
  }
}
```

Conventions:

- **Actions return `this`**, so they can be chained, and wait for their own result (the search waits for the
  new URL). Steps should not need `waitForTimeout`.
- **Checks belong in steps**, with `expect`. Page objects return `Locator`s for them (`noResultsMessage()`);
  web-first assertions (`toHaveText`, `toBeVisible`) wait up to `EXPECT_TIMEOUT_MS`.
- **`open()` verifies the page** (title, a key element), so a wrong URL fails at once with a clear message.

## The fixture

```ts
customersPage: async ({ windows }, use) => {
  await use(new CustomersPage(windows.first));
},
```

The page object is built on the scenario's **first window**. Asking for `customersPage` creates `windows`,
which creates `page`, which opens the browser context and the page.

## Windows (popups): `windows`

[`WindowNavigator`](../src/pages/WindowNavigator.ts) keeps track of which window the scenario is on. The
`AfterStep` screenshot and the failure screenshot use that window, not always the first one.

```ts
const price = new PricePage(await windows.switchToWindow(Window.PRICE_BOOKING));   // via the dropdown
await windows.switchToWindow(Window.CUSTOMER_WINDOW);   // from the Price window's dropdown
await windows.switchToWindow(Window.PRICE_BOOKING);     // back: already open, nothing is clicked
await windows.switchToWindow(Window.HOME);              // the first window
await windows.open(() => someLink.click(), 'Report');   // a window opened by any other action
windows.current;                                        // the window the scenario is on
```

| Method | Does |
|---|---|
| `switchToWindow(window)` | one of the app's windows ([`Window`](../src/pages/Window.ts)): `HOME` is the first window; one opened earlier and still showing is brought to the front; otherwise it is opened from the current window's dropdown (below) |
| `open(action, title?, ready?)` | runs `ready` (if given), then the action; finds the window that opened (see below), waits for it to load, checks its title, makes it current |
| `switchTo(title)` | makes an open window current, by title; fails with `No open window has the title "..."` |
| `window(title)` | an open window by title, without making it current (for page objects of one window) |
| `backToFirst()` | makes the first window current |
| `current` | the current window |
| `first` | the scenario's first window |

`open` does not need the current window to be the new window's opener. After the action it checks every 250 ms,
up to `NAVIGATION_TIMEOUT_MS`, for:

1. **a new window** in the browser context, whichever window opened it (the home window may open them all);
2. **an already open window** with the title: the app reused a named window (`window.open(url, name)`);
3. **the current window itself** with the title: the app loaded the new page into the window it was opened
   from. The Unique window does this: it replaces the Price window. The old title is then forgotten, so
   `windows.window(PricePage.TITLE)` fails until Price is opened again.

Cases 2 and 3 need `title`. Pass `ready` when the action may run before the current window is ready, for
example `() => pricePage.verifyDisplayed()`. The log says which case it was (`[WINDOW] ... opened a new
window`, `... is an already open window (reused)`, `... replaced "Price Booking" in the same window`). When none
shows up, it fails with the open windows' titles:

```text
Opened "Unique Window" from "Price Booking", but within 30000 ms no new window opened and no open window has the title "Unique Window". Open windows: ["Home","Unique Window"]
```

### The app's windows and the dropdown

[`Window`](../src/pages/Window.ts) lists the app's windows, the same as agentic-qa-java's `Window` enum. Each
has the text of its dropdown option, which is also its title, and the check of its page object:

| Window | Text | Opened from | Check |
|---|---|---|---|
| `HOME` | Home | (the first window) | none |
| `PRICE_BOOKING` | Price Booking | the home page's dropdown | `PricePage.verifyDisplayed` (title, Search Data button) |
| `CUSTOMER_WINDOW` | Customer Window | the Price window's dropdown | none |
| `UNIQUE_WINDOW` | Unique Window | the Price window's dropdown; replaces the Price window | `UniquePage.verifyDisplayed` (title) |

`switchToWindow` opens a window like this: it checks that the current window is ready (its own check and its
dropdown button), then [`SharedElements.selectDropdownOption`](../src/pages/SharedElements.ts) clicks the dropdown
button and the option (`dropdownButton` and `dropdownOption` in `locators/common.json`; if the list closes before
the option is clicked, it tries once more). `open` then finds the window, checks its title, and the new window's
own check runs. Adding a window: add an entry to `Window` with its exact option text.

The steps are in [`windows.steps.ts`](../src/steps/ui/windows.steps.ts), the same as agentic-qa-java's
`WindowSteps`:

```gherkin
When I open the Price Booking window
And I open the filter on the Price window
And I apply the search on the Price window
  | bookings | Booking A | Booking C |
  | days     | Monday    | Friday    |
And I open the Customer window
And I go back to the "Price Booking" window
Then the Price window is displayed
When I open the Unique window
And I switch to the "Home" window
```

`I switch to the "..." window` and `I go back to the "..." window` take the window's text; an unknown text fails
with the list of known windows. `I apply the search` selects the bookings (TEST1) and days (TEST2) with
`PricePage.applySearchs`, closing each list with Escape; empty cells are skipped.

These need the real application, not the sample app, so there is no feature for them in `features/`: a
`@windows` feature would fail `npm test` against the sample app.

[`UniquePage`](../src/pages/UniquePage.ts) is the Unique window, as in agentic-qa-java; its locators go in
`locators/unique.json` (empty for now).

A page object for a popup is created in the step, with the popup's `Page` (`new PricePage(price)`), because
the popup does not exist when the fixtures are set up.

[`PricePage`](../src/pages/PricePage.ts) is the Price window (AG Grid), as in agentic-qa-java. Its steps,
[`price.steps.ts`](../src/steps/ui/price.steps.ts), always work on that window's grid, whichever window the
scenario is on: they find it with `windows.window(PricePage.TITLE)`, so the Price window must be open.

```gherkin
Then the Price grid is loaded
When I check the Price grid rows matching
  | Booking | Booking A |
  | Status  | Open      |
When I uncheck the Price grid rows matching
Then the Price grid rows matching are checked
Then the Price grid rows matching are not checked
Then in the Price grid rows matching, "Status" is "Open"
When I click the "link" in column "Customer" of the Price grid rows matching
```

## Grids: `GridLibrary`

[`GridLibrary`](../src/pages/GridLibrary.ts) has the same functions for every data grid, and the same as
agentic-qa-java's `GridLibrary`. Columns are named by their **header text**, so tests never deal with column ids.
A row is found by a `RowMatch` (`{ header: value, ... }`): the row must show every value. For AG Grid the values
may sit in different parts of the row (pinned and scrolling).

```ts
const grid = await customersPage.grid().waitUntilLoaded();
const admin = { Name: 'COE', Role: 'Admin' };

await grid.cells('Name', 'Ada Lovelace');                   // the Name cells showing "Ada Lovelace"
await grid.cellWithValue('Ada Lovelace');                   // every cell, in any column, showing it
await grid.contains('Name', 'Ada Lovelace');                // true / false, waits up to the action timeout
await grid.columnValues('Name');                            // ['Ada Lovelace', 'Alan Turing']
await grid.rows(admin);                                     // every row matching both columns
await grid.cells(admin, 'Status');                          // the Status cells of those rows
await grid.values(admin, 'Status');                         // their texts: ['active']
await grid.elements(admin, 'checkbox');                     // the checkboxes anywhere in those rows
await grid.elements(admin, 'button', 'Actions');            // the buttons in their Actions column
await grid.elements(admin, "[data-testid='edit']");         // any CSS selector
```

Every function works on **all** matching rows and returns a locator for all of them (or a list of texts). For one
of them, add `.first()`, `.nth(i)` or `.last()`; to act on each, loop over `.all()`.

| Function | Returns |
|---|---|
| `waitUntilLoaded()` | waits for the grid, its header, the loading overlay to go, and a row or the "no rows" message |
| `cells(header, value)` | the cells of column `header` whose whole text is `value` |
| `cellWithValue(value)` | every cell, in any column, whose whole text is `value` |
| `contains(header, value)` | whether the column shows the value |
| `columnValues(header)` | the texts of the column, top to bottom, trimmed |
| `rows(match)` | every row showing all the values, top to bottom; for AG Grid, all parts of them (pinned and scrolling parts share a `row-index`) |
| `cells(match, targetHeader)` | the `targetHeader` cells of those rows |
| `values(match, targetHeader)` | their trimmed texts, as `string[]` |
| `elements(match, type)` | the elements of a type anywhere in those rows: `checkbox`, `radio`, `button`, `link`, `input`, `dropdown`, `image`, or a CSS selector |
| `elements(match, type, targetHeader)` | the same, in column `targetHeader` |

In a feature ([`grid.steps.ts`](../src/steps/ui/grid.steps.ts), the same steps as agentic-qa-java), a row step ends
in "matching" and the rows follow as a `| header | value |` table (names are made unique per scenario). Check,
uncheck and the checks work on every matching row and fail if the rows have no checkbox; a click clicks the first:

```gherkin
Then the grid is loaded
Then the grid column "Name" contains "COE"
Then the grid column "Name" does not contain "Nobody"
Then the grid column "Name" shows
  | COE |
  | HR  |
Then in the grid rows matching, "Status" is "Active"
  | Name | COE   |
  | Role | Admin |
When I check the grid rows matching
When I uncheck the grid rows matching
When I check "Select" in the grid rows matching
Then the grid rows matching are checked
Then the grid rows matching are not checked
When I click "Email" in the grid rows matching
When I click the "button" in the grid rows matching
When I click the "link" in column "Customer" of the grid rows matching
```

How a column is found: the header cell is located by its text, then the library reads its `col-id` (AG Grid).
If there is none, it uses the header's position and matches cells with `:nth-child(n)` (a plain HTML table).
The result is cached for the grid object.

### One locator file per kind of grid

| File | For |
|---|---|
| [`locators/grid.ag-grid.json`](../src/pages/locators/grid.ag-grid.json) | AG Grid's standard markup (the default) |
| [`locators/grid.customers-table.json`](../src/pages/locators/grid.customers-table.json) | the customers page's plain `<table>` |

A page object passes its grid's file: `new GridLibrary(this.page, tableLocators)`. A new kind of grid needs a
new file with the same keys (`root`, `header`, `headerCell` with `HEADER`, `rowsOrNoRows`, `row`, `cell`, and
the element types); `loadingOverlay` and `columnIndexAttribute` are optional.

Every selector except `root` is searched **inside the grid's root**, so write them relative to it: `thead`, not
`#customers-table thead` (Playwright does not count the root itself when it searches inside it, so a selector that
repeats the root's id finds nothing).

### Several grids on one page

Some windows of the real application show two AG Grids at once. `GridLibrary` works on one grid at a time: every
lookup is inside its `root`, so the two grids' rows (both have a `row-index` 0) are never mixed. On such a window,
pick the grid by a column only it has. The same as agentic-qa-java (its `docs/multiple-grids.md`).

```gherkin
When I open the Price Booking window
And I use the grid with column "Booking"
Then the Price grid is loaded
When I check the Price grid rows matching
  | Booking | Booking A |
And I use the grid with column "Customer"
When I use the only grid
```

| Step | Does |
|---|---|
| `When I use the grid with column "Booking"` | picks the current window's grid that has that column (AG Grid) and waits until it has loaded |
| `When I use the grid in "bookingsGrid"` | picks the grid in an element of the window, a locator of its locator file: for grids that show the same columns (`price.gridIn('bookingsGrid')` in code) |
| `When I use the only grid` | goes back to the window's single grid |

After the step, every grid on that window is the picked one: `price.grid()`, the Price grid steps and the
`PricePage` methods they call (`elementsInCell`, `verifySelectionShown`, ...). The choice belongs to the window
(other windows keep theirs), is dropped when the window's page is replaced in place (Price Booking becoming Unique
Window), and ends with the scenario.

In code:

```ts
const bookings = await price.grid('Booking').waitUntilLoaded();   // the grid with a Booking column, always
await bookings.values({ Booking: 'Booking A' }, 'Status');        // inside that grid only
await bookings.root().locator("button:has-text('Export')").click(); // the grid element itself
useGrid(page, 'Booking');                                         // what the step does; undefined = only grid
new GridLibrary(page, undefined, 'Booking');                      // without a page object
```

| Message | Means | Fix |
|---|---|---|
| `2 grids on <url>: pick one by a column only it has, ...` | a grid step ran on a window with two grids and none was picked | add `I use the grid with column "..."` before it |
| `2 grids have a "Status" column on <url>: ...` | both grids have the picked column | pick a column only one of them has |
| `the grid with the column "Bookings" is shown` (expect timeout) | no grid has that column | check the header text exactly as shown |

Grids with exactly the same columns cannot be told apart by a column; that would need picking by a container
locator, which is not built.

Everything about several grids, in more detail: [multiple-grids.md](multiple-grids.md).

## Adding a page

1. `src/pages/locators/orders.json` with the elements (see [locators.md](locators.md)).
2. `src/pages/OrdersPage.ts`:
   ```ts
   import locators from './locators/orders.json';

   export class OrdersPage {
     static readonly PATH = '/orders';
     private readonly el: PageElements;

     constructor(readonly page: Page) {
       this.el = new PageElements(page, locators, 'locators/orders.json');
     }

     async open(): Promise<this> {
       await this.page.goto(OrdersPage.PATH);
       await expect(this.el.get('heading')).toBeVisible();
       return this;
     }
   }
   ```
3. A fixture in `src/fixtures/test.ts`, and its type in `ScenarioFixtures`:
   ```ts
   ordersPage: async ({ windows }, use) => {
     await use(new OrdersPage(windows.first));
   },
   ```
4. Steps in `src/steps/ui/orders.steps.ts` that ask for `ordersPage`.

A page on **another application** opens with its full URL (`page.goto('https://other.example.com/...')`)
instead of a path relative to `BASE_URL`.
