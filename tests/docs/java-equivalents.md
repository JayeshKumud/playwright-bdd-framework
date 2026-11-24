# Java framework → this framework: what replaces what

This framework does the same job as the Java framework (agentic-qa-java): Cucumber features, GUI and API steps
in one scenario, data shared between steps, clean-up after every scenario, evidence on failure. It is built on
**Playwright Test** with **playwright-bdd**, not on Cucumber-JVM, TestNG and PicoContainer, so many pieces
have a different name or have disappeared because Playwright already provides them.

This page lists every Java piece and what replaces it. The other pages explain each part in detail.

## The short version

| Java | Here | Where |
|---|---|---|
| PicoContainer (creates glue classes, injects constructors) | **Playwright fixtures**: steps ask for objects by name in their first argument | [src/fixtures/test.ts](../src/fixtures/test.ts), [fixtures.md](fixtures.md) |
| `TestSession` (per-scenario state) | **no single class**: one fixture per thing (`data`, `cleanup`, `page`, `windows`, `customersApi`, ...) | [fixtures.md](fixtures.md) |
| `TestSession.data()` store, `DataKey<T>` | **`data` fixture**: `ScenarioData` with `DataKey<T>` | [src/core/ScenarioData.ts](../src/core/ScenarioData.ts), [keys.md](keys.md) |
| `Keys.java` | **`Keys`** in `core/keys.ts` | [src/core/keys.ts](../src/core/keys.ts) |
| `TestSession.current()` (session from static code) | **not needed**: pass the fixture in (see [explanation.md](explanation.md#q5-is-there-an-equivalent-of-testsessioncurrent)) | |
| `TestInitializeHooks` (`@Before` / `@After`) | **fixture teardown** (after `await use(...)`) and **`Before` / `After` / `AfterStep`** hooks | [hooks.md](hooks.md) |
| `@Before(order = n)`, `@After(order = n)` | fixture dependencies decide the order; hooks run in the order they are registered | [hooks.md](hooks.md#order) |
| `@BeforeAll` / `@AfterAll` | `BeforeAll` / `AfterAll` from `createBdd` (once per **worker**), or a worker-scoped fixture, or `globalSetup` | [hooks.md](hooks.md#once-per-worker-or-once-per-run) |
| `ServiceCleanup` + `cleanup.add(...)` | **`cleanup` fixture** (`Cleanup`) and `customersApi.track(id)` | [src/core/Cleanup.ts](../src/core/Cleanup.ts) |
| `Api` + `ApiFactory.getApi(...)` (one instance per run) | **one API client fixture per scenario** (`customersApi`), on the scenario's browser context | [api.md](api.md) |
| REST Assured `Response`, `Assert.fail` | Playwright `APIResponse`, `expect(...)` | [api.md](api.md) |
| Model classes + Jackson | TypeScript `type`s (`Customer`, `CustomerInput`), plain JSON | [src/api/CustomersApi.ts](../src/api/CustomersApi.ts) |
| `BrowserPool` (one browser per thread) | Playwright's worker-scoped `browser`: one browser per **worker process**, a new context per scenario | built in |
| Lazy `session.page()` | the `page` fixture is only created when a step or hook asks for it | built in |
| `Pages` + `PageComponentsFactory` + `TestSession.pageComponent` | **one fixture per page object** (`customersPage`, `customersAppPage`); Playwright caches it per scenario | [page-objects.md](page-objects.md) |
| `PageElements` + `LocatorRepository` + `locators/*.json` | `PageElements` + `src/pages/locators/*.json` (imported, so typos in file names fail at compile time) | [locators.md](locators.md) |
| `SmartLocator`, `Healer`, fingerprints (self-healing) | **not in this framework** | |
| `Variables` (`${name}` in features), `{unique}` | **not in this framework**; names are made unique per scenario by `scenarioName(...)` | [unique-data.md](unique-data.md) |
| `UniqueData`, `BASE_UNIQUE` | `unique()`, `uniqueEmail()`, `uniqueSuffix()`, `Keys.SUFFIX` | [src/core/unique.ts](../src/core/unique.ts) |
| `TestRunner` (`@CucumberOptions`, TestNG `DataProvider(parallel = true)`) | `playwright.config.ts` + `defineBddConfig(...)`; `bddgen` turns features into Playwright tests | [playwright.config.ts](../playwright.config.ts) |
| Surefire `-Dthreads` | `WORKERS` (env file) or `--workers=N` | [running-tests.md](running-tests.md) |
| `@Parallel` / `@Sequential` | `fullyParallel: true` by default; `@mode:serial` on a feature runs its scenarios one after the other | [running-tests.md](running-tests.md#parallel-or-sequential) |
| `ScenarioRetry`, `retry.count`, `retry.tags` | `RETRIES` (env file), `--retries=N`, `@retries:N` tag | [running-tests.md](running-tests.md#retries) |
| `-Dcucumber.filter.tags="@api and not @slow"` | `--grep @api` / `--grep-invert @slow`, or the `test:*` scripts | [running-tests.md](running-tests.md) |
| `failed-scenarios.txt` rerun | `npx playwright test --last-failed` | [running-tests.md](running-tests.md#re-running-only-what-failed) |
| `EnvConfig` + `Settings` + `config/common.properties` + `config/env/<env>.properties` | `env` in `config/env.ts` + `env/<TEST_ENV>.env` (+ `env/local.env`) | [src/config/env.ts](../src/config/env.ts), [running-tests.md](running-tests.md#configuration) |
| `-Denv=uat`, `-Dui.baseUrl=...` | `TEST_ENV=ci`, `BASE_URL=...` (environment variables) | [running-tests.md](running-tests.md) |
| `RunSummaryPlugin`, `ReportSetupPlugin`, Extent | Playwright `list` + HTML reporter, Allure, Cucumber HTML/JSON | [reporting.md](reporting.md) |
| Screenshot and trace in `TestInitializeHooks.closeBrowser` | `windows` fixture teardown (screenshot on failure), `trace` / `video: 'retain-on-failure'` in the config | [reporting.md](reporting.md) |
| Cleaning reports before a run (`cleanup.beforeRun`) | `scripts/clean.js`, run by `npm test` | [running-tests.md](running-tests.md#clean-results-before-each-run) |
| — | ActiveMQ client (`mq` fixture), backend mocking (`backendMock`), popups (`windows`), grids (`GridLibrary`) | [messaging.md](messaging.md), [backend-mock.md](backend-mock.md), [page-objects.md](page-objects.md) |

## Same code, both ways

### A step that stores data for later steps

```java
// Java: PicoContainer injects TestSession into the constructor
public class CustomerApiSteps {
    private final TestSession session;
    public CustomerApiSteps(TestSession session, ServiceCleanup cleanup) { this.session = session; ... }

    @Given("a customer named {string} exists")
    public void createCustomer(String name) {
        Customer customer = ApiFactory.getApi(CustomerApi.class).postCustomer(new Customer(name, email)).as(Customer.class);
        cleanup.add("customer " + customer.getId(), () -> ApiFactory.getApi(CustomerApi.class).deleteCustomer(customer.getId()));
        session.data().put(Keys.CUSTOMER, customer);
    }
}
```

```ts
// Here: the step asks for the fixtures it needs by name
Given('a customer named {string} exists', async ({ customersApi, data }, name: string) => {
  data.put(Keys.CUSTOMER, await customersApi.create({ name: scenarioName(data, name), email: uniqueEmail() }));
  // create() tracks the id; the customersApi fixture deletes it after the scenario
});
```

There is no class, no constructor and no injection container. The step function's **first argument** is an
object of fixtures; Playwright reads which names the function destructures (`customersApi`, `data`) and creates
just those, once per scenario.

### Reading it in a step of another file

```java
// Java: CustomerUiSteps, the same TestSession injected
page().open().search(session.data().get(CUSTOMER).getName());
```

```ts
// Here: src/steps/ui/customers.steps.ts, the same `data` object for this scenario
When('I search the customers page for that customer', async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(data.get(Keys.CUSTOMER).name);
});
```

### Before and after a scenario

```java
// Java: TestInitializeHooks
@Before(order = 1) public void bindSession(Scenario s) { session.scenarioName(s.getName()); session.bindToCurrentThread(); }
@After(order = 4)  public void closeBrowser(Scenario s) { if (s.isFailed()) screenshot(); session.close(s.isFailed()); }
```

```ts
// Here: the set-up and tear-down of the thing itself, in its fixture (src/fixtures/test.ts)
windows: async ({ page, ui }, use, testInfo) => {
  const windows = new WindowNavigator(page, ui);   // before: set up
  await use(windows);                              // the scenario runs here
  if (failed(testInfo)) { /* full-page screenshot of the current window */ }   // after: tear down
},

// or a Cucumber-style hook, for things that are not one object's set-up
Before({ tags: '@api' }, async ({ $testInfo }) => { ... });
After(async ({ $testInfo, data }) => { ... });
```

Nothing has to "bind" or "close" the session: Playwright creates a fixture when it is first asked for and
tears it down when the scenario ends, pass or fail.

## What is different on purpose

- **No `TestSession` god object.** Each piece of scenario state is its own small fixture, so a scenario only
  pays for what it uses: an API-only scenario never creates a page, an MQ-only scenario never starts a browser.
  `data` plays the part of `TestSession`'s store.
- **No ThreadLocal at all.** JavaScript runs one scenario at a time per worker process, and the fixtures are
  passed into each step, so there is nothing to bind to a thread and nothing to clear.
- **API calls share the browser's session.** The Java API classes call REST Assured directly and do not share
  the browser's cookies. Here `customersApi` uses `context.request`, the request object of the scenario's
  browser context, so a login done in the GUI is also used by API calls, and the other way round. That is why
  the API client is created per scenario instead of once per run like `ApiFactory`.
- **Parallel by processes, not threads.** Playwright runs scenarios in separate worker processes (`WORKERS`).
  Worker-scoped fixtures (`mq`, Playwright's `browser`) are shared by the scenarios of one worker; everything
  else is per scenario.

## What the Java framework has that this one does not

| Java feature | Status here |
|---|---|
| Self-healing locators (`SmartLocator`, `Healer`, `healing/fingerprints.json`) | not built; locators fail with Playwright's normal error |
| `Variables`: `${name}` and `{unique}` in feature files | not built; steps make names unique with `scenarioName(...)` |
| `run-summary.html` / `.json`, `job_summary.py` | not built; Playwright HTML, Allure and Cucumber reports cover it |
| `TestSession.current()` for code outside steps | not needed; see [explanation.md](explanation.md#q5-is-there-an-equivalent-of-testsessioncurrent) |
| A `tests.yml` CI workflow | not in this repository; the commands are in [running-tests.md](running-tests.md#ci) |
