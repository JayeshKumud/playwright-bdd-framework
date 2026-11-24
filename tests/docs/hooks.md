# Hooks: before and after scenarios, steps and workers

The Java framework does its set-up and clean-up in `TestInitializeHooks` and `ServiceCleanup` with
`@Before(order = n)` and `@After(order = n)`. This framework has two tools for the same job:

1. **Fixture tear-down** (the code after `await use(...)`): for clean-up that belongs to one object. Most of
   the framework's "after scenario" work is done this way. See [fixtures.md](fixtures.md).
2. **Cucumber-style hooks** from playwright-bdd: `Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAll`,
   `AfterAll`. For work that is not one object's set-up, or that only applies to some tags.

## What the framework does before and after each scenario

| Java (`TestInitializeHooks`, `ServiceCleanup`) | Here | Kind |
|---|---|---|
| `@Before(order = 1) bindSession`: name the session, bind it to the thread | nothing: fixtures are passed in, there is no thread to bind | — |
| browser context started lazily by `session.page()` | the `page` / `context` fixture, created on first use | built in |
| `@After` attach heal events | — (no self-healing) | — |
| `@After` screenshot on failure | `windows` fixture tear-down: full-page screenshot of the **current** window | fixture |
| screenshot after each step | `AfterStep` hook in `fixtures/test.ts` (`SCREENSHOT_EVERY_STEP`) | hook |
| `@After(order = 4) closeBrowser`: stop tracing, save trace if failed, close context | `trace: 'retain-on-failure'`, `video: 'retain-on-failure'` in `playwright.config.ts`; Playwright closes the context | built in |
| `@After(order = 2)` `ServiceCleanup`: delete what the scenario created | `customersApi` tear-down (tracked customers), `cleanup` tear-down (any action) | fixture |
| API calls attached on failure | `apiLog` tear-down | fixture |
| MQ connection closed at the end | `mq` worker fixture tear-down | fixture |

## The hooks

They are exported from [src/fixtures/test.ts](../src/fixtures/test.ts):

```ts
export const { Given, When, Then, Step, Before, After, BeforeStep, AfterStep } = createBdd(test);
```

`createBdd` also returns `BeforeAll`, `AfterAll`, `BeforeWorker`, `AfterWorker`, `BeforeScenario` and
`AfterScenario`. They are not exported yet; add them to that line when you need them.

| Hook | Runs | Can use | Java equivalent |
|---|---|---|---|
| `Before` (alias `BeforeScenario`) | before the first step of each scenario | any fixture | `@Before` |
| `After` (alias `AfterScenario`) | after the last step of each scenario, **before** fixture tear-down | any fixture | `@After` |
| `BeforeStep` | before every step | any fixture, `$step` | `@BeforeStep` |
| `AfterStep` | after every step | any fixture, `$step` | `@AfterStep` |
| `BeforeAll` (alias `BeforeWorker`) | once per **worker process**, before its first scenario | worker fixtures only (`mq`, `browser`, ...) | `@BeforeAll` |
| `AfterAll` (alias `AfterWorker`) | once per worker process, after its last scenario | worker fixtures only | `@AfterAll` |

Under the hood `Before` / `After` are Playwright `test.beforeEach` / `test.afterEach`, and `BeforeAll` /
`AfterAll` are `test.beforeAll` / `test.afterAll` guarded so they run once per worker.

### The hook the framework uses

```ts
/**
 * After every step: a screenshot of the window the scenario is on (not always the first window), when
 * SCREENSHOT_EVERY_STEP is on and the scenario has opened a page. API and MQ steps before any page get none.
 */
AfterStep(async ({ ui, $testInfo, $step }) => {
  if (!env.screenshotEveryStep || !ui.current || ui.current.isClosed()) return;
  if (ui.current.url() === 'about:blank') return;
  const png = await ui.current.screenshot().catch(() => undefined);
  if (png) await $testInfo.attach($step.title || 'step', { body: png, contentType: 'image/png' });
});
```

It asks for `ui`, not `page`: asking for `page` would open a browser in every API and MQ scenario.

## Writing a hook

```ts
import { After, Before, BeforeAll } from '../fixtures/test';   // never from 'playwright-bdd'

// every scenario
Before(async ({ $testInfo }) => {
  console.log(`starting ${$testInfo.title}`);
});

// only scenarios tagged @api (a Cucumber tag expression)
Before({ tags: '@api and not @smoke' }, async ({ customersApi }) => {
  ...
});

// a name, shown in the reports, and a timeout
After({ name: 'log out', timeout: 10_000 }, async ({ page }) => {
  ...
});

// once per worker (export BeforeAll from fixtures/test.ts first)
BeforeAll(async ({ mq }) => {
  ...
});
```

### Where to put hooks

The `steps` setting in [playwright.config.ts](../playwright.config.ts) decides which files are loaded:

```ts
steps: ['src/fixtures/test.ts', 'src/steps/**/*.ts'],
```

A hook in a new file is only picked up if the file matches. Put framework-wide hooks in
`src/steps/hooks.ts` (matched already), or in `fixtures/test.ts` next to the `AfterStep` hook.

## Order

There is no `order = n`. Instead:

- **Hooks of one kind run in the order they are registered**: the order of the files in `steps`, then the order
  in each file. Keep hooks that depend on each other in one file.
- **A failing `Before` hook stops the scenario**; its steps are skipped. **A failing `After` hook** does not stop
  the other `After` hooks: they all run, and the first error is reported.
- **`After` hooks run before fixtures are torn down**, so an `After` hook can still use the page, the API client
  and `data`.
- **Fixture tear-downs run in reverse order of creation**, and never before the fixtures they depend on. That
  replaces most of the Java `order` numbers: the Java framework needed `closeBrowser` (4) to run before
  `ServiceCleanup` (2), here `customersApi` deletes its customers before `context` is closed simply because it
  depends on `context`.

## Hook or fixture?

| Use a **fixture** when | Use a **hook** when |
|---|---|
| the clean-up belongs to one object you create (a client, a page object, a subscription) | the work is not about one object (logging, a check after every step) |
| it should happen only if the scenario used that object | it should happen for every scenario, or for a tag |
| other code needs the object | nothing needs a value from it |

Fixtures are the default here. A fixture is only created when something asks for it, so its set-up and
tear-down cost nothing in scenarios that don't use it. A `Before` hook that asks for `page` opens a browser in
**every** scenario it matches.

## Once per worker or once per run

| Need | Use |
|---|---|
| once per worker process (a connection, a login of a shared user) | a fixture with `{ scope: 'worker' }` (like `mq`), or `BeforeAll` / `AfterAll` |
| once for the whole run, before any worker starts (seed a database, start a service, log in and save `storageState`) | Playwright's `globalSetup` / `globalTeardown` in `playwright.config.ts`, or a setup project |

A worker restarts after a failed scenario, so worker-level set-up can run more often than `WORKERS` times.
Make it safe to run again.

## Related

- [fixtures.md](fixtures.md): every fixture, its set-up and tear-down
- [reporting.md](reporting.md): what the hooks and fixtures attach to the reports
