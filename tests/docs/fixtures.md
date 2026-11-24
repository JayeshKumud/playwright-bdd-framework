# Fixtures: the scenario's objects

A **fixture** is an object a step can ask for by name. Fixtures do the jobs that PicoContainer and
`TestSession` did in the Java framework: they create the scenario's objects, hand the same instance to every
step, and clean up after the scenario. All of them are defined in one file,
[src/fixtures/test.ts](../src/fixtures/test.ts).

```ts
When('I search the customers page for that customer', async ({ customersPage, data }) => {
  //                                                         ^ fixtures this step needs
  await customersPage.open();
  await customersPage.search(data.get(Keys.CUSTOMER).name);
});
```

## How a fixture is written

```ts
export const test = bddTest.extend<ScenarioFixtures, WorkerFixtures>({
  cleanup: async ({}, use, testInfo) => {
    const cleanup = new Cleanup();          // 1. set-up: runs the first time a step or hook asks for `cleanup`
    await use(cleanup);                     // 2. hands it out; the rest of the scenario runs here
    const failures = await cleanup.runAll();// 3. tear-down: runs after the scenario, pass or fail
    if (failures.length) await testInfo.attach('clean-up failures', { body: failures.join('\n'), contentType: 'text/plain' });
  },
});
```

| Part | Meaning |
|---|---|
| `({}, ...)` | the fixtures this fixture needs. `{}` means none; `({ context, apiLog }, ...)` means it is built from those two |
| `use(value)` | gives `value` to every step and hook of the scenario that asks for it, and waits until the scenario is over |
| code after `await use(...)` | the tear-down. It runs even if a step failed |
| `testInfo` | Playwright's information about the running test: status, attachments, output folder |

`createBdd(test)` at the bottom of the file creates `Given`, `When`, `Then`, `Before`, `After`, ... bound to
this `test`, so every step can use these fixtures with full type checking. Steps must import them from
`fixtures/test.ts`, not from `playwright-bdd`.

## Rules Playwright applies

- **Created on first use.** A fixture is set up only when a step, a hook or another fixture asks for it. That
  is why an API-only scenario never opens a page: no step asks for `page`.
- **One instance per scenario.** Every step of the scenario that asks for `data` gets the same `ScenarioData`.
  The next scenario gets a new one. (Worker-scoped fixtures, below, are the exception.)
- **Dependencies first.** If `customersApi` needs `context`, `context` is created first.
- **Torn down in reverse.** A fixture is torn down **before** the fixtures it depends on. `customersApi` deletes
  its customers while `context` (and its session cookies) is still open; `windows` takes its failure screenshot
  before `page` is closed.
- **Tear-down always runs**, pass or fail, and a failing tear-down is reported as an error of the scenario.

## The fixtures

### Per scenario

| Fixture | Type | Needs | Set-up | Tear-down |
|---|---|---|---|---|
| `data` | [`ScenarioData`](../src/core/ScenarioData.ts) | — | new empty store | — (thrown away) |
| `cleanup` | [`Cleanup`](../src/core/Cleanup.ts) | — | empty list of actions | runs the actions newest first; attaches failures as `clean-up failures` |
| `ui` | [`UiState`](../src/pages/WindowNavigator.ts) | — | `{ current: undefined }` | — |
| `page` | Playwright `Page` (overridden) | Playwright's `page`, `ui` | registers the page as `ui.current` | Playwright closes it |
| `windows` | [`WindowNavigator`](../src/pages/WindowNavigator.ts) | `page`, `ui` | first window = `page` | on failure: full-page screenshot of the **current** window, as `failure screenshot` |
| `customersPage` | [`CustomersPage`](../src/pages/CustomersPage.ts) | `windows` | page object on the first window | — |
| `customersAppPage` | [`CustomersAppPage`](../src/pages/CustomersAppPage.ts) | `windows` | page object on the first window | — |
| `apiLog` | [`ApiLog`](../src/api/ApiLog.ts) | — | empty log | on failure: attaches every API call as `api calls` |
| `customersApi` | [`CustomersApi`](../src/api/CustomersApi.ts) | `context`, `apiLog` | client on `context.request` | deletes every tracked customer, newest first; attaches failures |
| `backendMock` | [`BackendMock`](../src/mock/BackendMock.ts) | `context` | no routes yet | — (routes end with the context) |

Playwright's own fixtures are available too: `page`, `context`, `browser`, `request`, `browserName`, and
playwright-bdd's `$testInfo`, `$step`, `$tags` in hooks.

### Per worker

| Fixture | Type | Set-up | Tear-down |
|---|---|---|---|
| `mq` | [`MessageClient`](../src/mq/MessageClient.ts) (`AmqpMessageClient`) | client created; the connection opens on the first `send` / `receive` | connection closed when the worker ends |

A worker fixture is declared with `{ scope: 'worker' }`:

```ts
mq: [
  async ({}, use) => {
    const client = new AmqpMessageClient(env.mq);
    await use(client);
    await client.close();
  },
  { scope: 'worker' },
],
```

It is created once per worker process and shared by every scenario that worker runs, which is what Java did
with a static or per-thread client. Only use worker scope for things that hold **no scenario data**: a
connection, a client. A worker fixture cannot depend on a per-scenario fixture.

## Why `ui` and `page` are separate

`ui` only remembers which window the scenario is on. It has no browser of its own, so the `AfterStep`
screenshot hook can ask for `ui` in every scenario without starting a browser in API and MQ scenarios. `page`
is overridden so that the first window registers itself in `ui` as soon as anything uses it, and
`WindowNavigator` moves `ui.current` when a popup opens.

## The tear-down order of a mixed scenario

For `features/e2e/customer_journey.feature` ("A customer created through the API appears on the page"):

```
Given a customer named "Ada Lovelace" exists        → sets up context, apiLog, customersApi, then data
When I search the customers page for that customer → sets up ui, page, windows, customersPage
Then the results show only that customer ...       → (all already there)

After hooks have run

Tear-down, newest first, and never before the fixtures that depend on it:
  customersPage                                       (nothing)
  windows       → failure screenshot of the current window, if failed
  page          → closed
  data          (nothing)
  customersApi  → DELETE /customers/<id>  (context still open: same session)
  apiLog        → attaches the API calls, if failed
  context       → closed (trace and video saved if failed)
```

The exact order between fixtures that do not depend on each other (`data` and `customersApi` here) follows
the order they were set up in. Only rely on the dependency rule: a fixture's tear-down runs while everything
it was built from is still open.

## Adding a fixture

1. Add its type to `ScenarioFixtures` (or `WorkerFixtures`) with a one-line comment saying what it is.
2. Add the fixture function to `bddTest.extend({...})`: set-up, `await use(value)`, tear-down.
3. Ask for it by name in a step: `async ({ ordersApi, data }) => { ... }`.

```ts
// a page object
ordersPage: async ({ windows }, use) => {
  await use(new OrdersPage(windows.first));
},

// an API client that deletes what it created
ordersApi: async ({ context, apiLog }, use, testInfo) => {
  const api = new OrdersApi(context.request, apiLog);
  await use(api);
  const failures = await api.deleteTracked();
  if (failures.length) await testInfo.attach('clean-up failures', { body: failures.join('\n'), contentType: 'text/plain' });
},
```

## What not to do

- **No module-level variables for scenario data** (`let lastCustomer;` at the top of a steps file). A worker
  runs many scenarios one after another, so the value leaks into the next scenario. Use `data`.
- **No `new ScenarioData()` or `new Cleanup()` in steps.** You get a private, empty object that no other step
  sees and nobody cleans up. Ask for the fixture.
- **No `test.extend` in another file.** Steps bound to a different `test` would not see these fixtures. Add new
  fixtures to `src/fixtures/test.ts`.

## Related

- [hooks.md](hooks.md): `Before`, `After`, `AfterStep`, and when to use a hook instead of a fixture
- [explanation.md](explanation.md): how a fixture is created, step by step, compared with PicoContainer
- [keys.md](keys.md): the `data` fixture and its typed keys
