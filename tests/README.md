# playwright-bdd-framework

BDD test framework in TypeScript: Cucumber features run by **Playwright Test** through
[playwright-bdd](https://vitalets.github.io/playwright-bdd). It covers:

- **GUI**: page objects with JSON locator files, a grid library, window (popup) switching, and frontend
  tests against a **mocked backend**.
- **API**: typed API clients. They use the same browser context as the GUI steps, so cookies and session are
  shared.
- **ActiveMQ**: sending and reading messages over AMQP 1.0 (rhea), on queues and topics, with selectors.
- **Reports**: Allure, the Playwright HTML report, and Cucumber HTML/JSON. Every report gets a screenshot after
  each GUI step; failed scenarios also get a full-page screenshot, the trace and the video.

**Documentation** is in [docs/](docs/README.md): architecture, fixtures, hooks, shared data, and a page mapping
every part of the Java framework to its equivalent here ([docs/java-equivalents.md](docs/java-equivalents.md)).

**Everything lives in this `tests/` folder** (package.json, config, code), so the folder can be dropped into an
application repository without touching anything outside it.

## Quick start

```bash
cd tests
npm install
npm run browsers:install        # Chromium for Playwright, once per machine
npm test                        # all scenarios
npm run test:mock               # frontend scenarios with a mocked backend (needs no backend)
npm run allure:serve            # open the Allure report of the last run
```

The examples test the sample app (`sample-target-app`, FastAPI) on `http://127.0.0.1:8000`:
`uv run uvicorn app.main:app --port 8000`. The `@mq` scenarios need a broker: `npm run mq:start` (Docker), or
any ActiveMQ with AMQP switched on (see [ActiveMQ](#activemq)).

| Command | What it runs |
|---|---|
| `npm test` | everything (cleans the last results, generates the tests, runs them) |
| `npm run test:ui` / `test:api` / `test:mq` / `test:e2e` / `test:mock` / `test:smoke` | one tag |
| `npm test -- --grep "@api and not @smoke"` | any tag expression or test name |
| `npm run test:headed` | with a visible browser, one worker |
| `npm run typecheck` | TypeScript check of the whole framework |
| `npm run allure:generate` then `allure:open` | static Allure report in `reports/allure` |
| `npm run report:html` | Playwright's HTML report (traces open in it) |
| `npm run steps:list` | every step definition, to find an existing step |

Settings come from `env/dev.env`, or from another file with `TEST_ENV=ci`
(PowerShell: `$env:TEST_ENV='ci'; npm test`). A real environment variable wins, then `env/local.env`
(your own overrides, not committed), then the env file.

## Layout

```
tests/
├── features/                     Gherkin, by area: ui/ api/ mq/ e2e/
├── src/
│   ├── fixtures/test.ts          test.extend: every fixture, Given/When/Then, step screenshot hook
│   ├── steps/                    step definitions, by area
│   ├── pages/                    page objects, GridLibrary, WindowNavigator, PageElements
│   │   └── locators/*.json       selectors, one file per page or grid
│   ├── api/                      API clients (CustomersApi) and the scenario's API log
│   ├── mq/                       MessageClient interface and AmqpMessageClient (rhea)
│   ├── mock/BackendMock.ts       mocked backend for frontend tests
│   ├── core/                     ScenarioData + typed keys, Cleanup, unique names
│   └── config/env.ts             typed settings from env/*.env
├── mocks/backend/*.json          mock responses for BackendMock
├── mocks/demo-frontend/          example single-page frontend for the @mock scenarios
├── env/                          dev.env, ci.env (local.env for your own, git-ignored)
├── docker/                       ActiveMQ for local runs
└── playwright.config.ts          runner, reporters, browser settings
```

Generated, never edited and never committed: `.features-gen/` (tests made from the features),
`test-results/`, `allure-results/` and `reports/`.

## How a scenario runs

`bddgen` turns each scenario into a Playwright test, and Playwright runs those tests in parallel workers.
Steps ask for **fixtures** by name, and each scenario gets fresh instances of them:

```ts
When('I search the customers page for that customer', async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(data.get(Keys.CUSTOMER).name);
});
```

| Fixture | What it is |
|---|---|
| `page`, `context` | Playwright's. One browser context per scenario. |
| `windows` | the windows of the scenario: `open(action, title)`, `switchTo(title)`, `current` |
| `customersPage`, ... | page objects |
| `customersApi`, ... | API clients on `context.request`: same cookies and session as the GUI |
| `backendMock` | mocks the backend the frontend calls |
| `mq` | ActiveMQ client (one connection per worker, opened on first use) |
| `data` | data shared between the steps of a scenario, under typed keys (`core/keys.ts`) |
| `cleanup` | clean-up actions run after the scenario, newest first |

A fixture is only created if a step asks for it, so API-only scenarios don't open a page and MQ-only ones don't
start a browser.

**Data and clean-up.** Names in features are made unique per scenario ("Ada Lovelace" becomes
"Ada Lovelace 3f9c2a1b"), so parallel runs never clash. Customers created through `customersApi.create` (or
passed to `customersApi.track`) are deleted after the scenario, even when it fails. They are deleted while the
browser context is still open.

### Adding a page

1. `src/pages/locators/orders.json`: `{ "submit": "#submit", "row": "tr:has(td:text-is('ID'))" }`.
2. `src/pages/OrdersPage.ts`: `this.el = new PageElements(page, locators)`, then `this.el.get('submit')` and
   `this.el.get('row', { ID: '42' })`.
3. Add a fixture in `src/fixtures/test.ts`: `ordersPage: async ({ windows }, use) => use(new OrdersPage(windows.first))`.

### Grids

`page.grid()` returns a `GridLibrary`. Columns are named by their header text or their position:

```ts
const grid = await customersPage.grid().waitUntilLoaded();
await grid.cells('Name', 'Ada Lovelace', 'Status');             // the Status cells of the rows where Name is Ada Lovelace
await grid.cellValues({ Role: 'Admin' }, 'Name');               // the Name of every row matching all the values
await (await grid.checkboxes('Booking', 'Booking A')).check();  // those rows' checkboxes
await grid.elements('Booking', 'Booking A', 'button', 'Actions'); // checkbox|radio|button|link|input|dropdown|image or CSS
await grid.elements('Booking', 'Booking A', 'link', 3);         // in the 3rd column
await grid.columnValues('Name');
```

Every function returns all matching rows; add `.first()` or `.nth(i)` for one of them.

`locators/grid.ag-grid.json` is for AG Grid. `grid.customers-table.json` shows how to describe a plain HTML table.

## Frontend with a mocked backend

Use this to test the frontend before the backend is ready. Mock files in `mocks/backend/` list the endpoints:

```json
[{ "method": "GET", "url": "/api/customers", "status": 200, "json": [{ "id": 1, "name": "Ada" }] }]
```

```gherkin
Given the backend is mocked with "customers-list"
And the backend answers GET "/api/customers" with status 500     # override one endpoint
Then the frontend sent POST "/api/customers" with "name" = "Katherine Johnson"
```

Calls that no mock answers get a 501 at once, rather than timing out. The mocks cover every window of the
scenario. API steps still reach the real backend, because routing doesn't intercept `context.request`.
`features/ui/frontend_mocked_backend.feature` runs against the demo frontend in `mocks/demo-frontend`. For your
frontend, open its real URL instead of serving the demo; the mock steps stay the same.

## ActiveMQ

`mq` is a `MessageClient`: `send`, `receive` (with a selector), `receiveMatching` and `subscribe` (topics). It
uses AMQP 1.0, which both ActiveMQ Classic and Artemis support on port 5672.

- **ActiveMQ 6.4 ships with AMQP switched off.** `docker/activemq/activemq.xml` is the default config with the
  AMQP connector switched on. For a shared broker, ask for
  `<transportConnector name="amqp" uri="amqp://0.0.0.0:5672"/>`.
- **Prefixes.** Queue and topic are marked by an address prefix (`MQ_QUEUE_PREFIX`, `MQ_TOPIC_PREFIX`; Classic
  uses empty and `topic://`) and by the AMQP capability. For Artemis, set the prefixes to the acceptor's
  `anycastPrefix` and `multicastPrefix`.
- **Isolation.** `Given a new queue "orders"` gives the scenario its own queue (`qa.orders.<suffix>`). Messages
  that are read are consumed. A queue named without that step is used as it is (your application's real queues).

## Moving into the application repository

Copy this `tests/` folder to the root of the application repository, then run `cd tests && npm install`. In CI,
run from `tests/`: `npm ci && npx playwright install --with-deps chromium && TEST_ENV=ci npm test`, then
publish `tests/allure-results` (or `reports/allure`) and `tests/reports/html`.
