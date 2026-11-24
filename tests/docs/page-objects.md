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
const price = await windows.open(() => home.selectDropdownOption('Price Booking'), 'Price Booking');
// the popup is loaded, its title checked, and it is now the current window
const pricePage = new PricePage(price);

await windows.switchTo('Customer Window');   // an open window, by its title
await windows.backToFirst();
windows.current;                               // the window the scenario is on
```

| Method | Does |
|---|---|
| `open(action, title?)` | runs the action, waits for the new window, waits for it to load, checks its title, makes it current |
| `switchTo(title)` | makes an open window current, by title; fails with `No open window has the title "..."` |
| `window(title)` | an open window by title, without making it current (for page objects of one window) |
| `backToFirst()` | makes the first window current |
| `current` | the current window |
| `first` | the scenario's first window |

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
