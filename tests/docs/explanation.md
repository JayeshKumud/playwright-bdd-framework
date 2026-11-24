# Explanation: questions and answers

Questions that come up when moving from the Java framework (Cucumber-JVM, PicoContainer, `TestSession`) to this
one, with the answers.

---

## Q1. Is there an equivalent of `TestSession`?

Not as one class. `TestSession` did several jobs; here each job is its own fixture:

| `TestSession` job | Here |
|---|---|
| the data store (`put` / `get` with `DataKey<T>`) | `data` (`ScenarioData`) |
| the browser context and page, opened lazily | Playwright's `context` and `page` fixtures, created on first use |
| the page objects of the scenario (`pageComponent`) | one fixture per page object (`customersPage`, ...) |
| the current window | `ui` and `windows` |
| `close(failed)`: trace, context, clean-up | fixture tear-downs and `trace: 'retain-on-failure'` |
| the scenario name | `$testInfo.title` in a hook, `testInfo.title` in a fixture |
| settings | `env` from `config/env.ts` |

What makes `TestSession` useful, **one object per scenario, given to every step class**, is exactly what a
fixture is. If you want "the session" in one word, it is `data`:

```ts
Given('a customer named {string} exists', async ({ customersApi, data }, name: string) => {
  data.put(Keys.CUSTOMER, await customersApi.create({ ... }));
});
```

---

## Q2. How does a step get its objects, without PicoContainer?

In the Java framework, Cucumber asks PicoContainer for an instance of the step class, PicoContainer looks at
the constructor and creates `TestSession`, `ServiceCleanup`, ... first, caching one of each per scenario.

Here there are no step classes. A step is a function, and its **first parameter** is an object of fixtures:

```ts
When('I search the customers page for that customer', async ({ customersPage, data }) => { ... });
```

Before calling it, Playwright:

1. Reads which names the function destructures: `customersPage` and `data`. (This is why the first parameter
   must be written as `{ ... }`, not as `(fixtures) =>`.)
2. For each name, returns the instance already made in this scenario, or creates it.
3. To create `customersPage`, it needs `windows` (from the fixture's own `({ windows }, use)`), which needs
   `page` and `ui`, which needs Playwright's `page`, which needs `context`, which needs `browser`. It creates
   them in that order, from the bottom up.
4. Calls the step with the instances.

```
Scenario starts
│
├─ step "a customer named {string} exists" asks for { customersApi, data }
│    ├─ customersApi needs { context, apiLog }
│    │    ├─ context  → browser (worker, already running) → new context      ← created
│    │    ├─ apiLog   → new ApiLog()                                          ← created
│    │    └─ new CustomersApi(context.request, apiLog)                        ← created
│    └─ data → new ScenarioData()                                             ← created
│
├─ step "I search the customers page for that customer" asks for { customersPage, data }
│    ├─ customersPage needs { windows } → needs { page, ui }
│    │    ├─ ui   → new UiState()                                             ← created
│    │    ├─ page → context.newPage() (context reused), ui.current = page     ← created
│    │    ├─ windows → new WindowNavigator(page, ui)                          ← created
│    │    └─ new CustomersPage(windows.first)                                 ← created
│    └─ data → already created in this scenario                               ← reused
│
├─ After hooks
├─ tear-downs, newest first (screenshot if failed, delete customers, close context)
│
Scenario ends → every per-scenario fixture is gone
```

| PicoContainer | Playwright fixtures |
|---|---|
| constructor parameters decide what is injected | the destructured names of the function decide |
| injection by **type** | injection by **name** |
| one container per scenario, discarded after | one set of fixtures per scenario, torn down after |
| no clean-up; hooks have to close things | each fixture has its own tear-down after `use` |
| lazily created when a step class is first needed | lazily created when a fixture is first asked for |
| `new` on a step class gives a separate object | `new` on a fixture's class gives a separate object, too |

---

## Q3. Is there an equivalent of the Hooks class (`@Before` / `@After`)?

Yes, two:

- **Fixture tear-down** for clean-up that belongs to one object. The framework uses this for the failure
  screenshot (`windows`), deleting customers (`customersApi`), clean-up actions (`cleanup`), the API log
  (`apiLog`) and closing the broker connection (`mq`).
- **Hooks**: `Before`, `After`, `BeforeStep`, `AfterStep` (exported from `fixtures/test.ts`), and `BeforeAll` /
  `AfterAll` (from `createBdd`, not exported yet). The framework uses one: the `AfterStep` screenshot.

Hooks can be limited to tags (`Before({ tags: '@api' }, ...)`) and can use any fixture. There is no
`order = n`: hooks run in the order they are registered, and fixture tear-downs run before the fixtures they
depend on. Details and examples are in [hooks.md](hooks.md).

---

## Q4. How do we share data across steps in different files?

Through the `data` fixture, with keys from `core/keys.ts`. Every step of the scenario that asks for `data` gets
the same `ScenarioData`:

```gherkin
Given a customer named "Ada Lovelace" exists                       # steps/api/customers.steps.ts
When I search the customers page for that customer                 # steps/ui/customers.steps.ts
Then the results show only that customer with status "active"      # steps/ui/customers.steps.ts
```

```ts
data.put(Keys.CUSTOMER, customer);               // API step
const customer = data.get(Keys.CUSTOMER);        // GUI step: a Customer, no cast
```

Other ways objects are shared:

- **Any fixture** is shared by all steps of the scenario: both API and GUI steps that ask for `customersApi` get
  the same client, so every customer either of them tracks is deleted at the end.
- **Within one step file**, don't use module-level variables: a worker runs many scenarios, so the value leaks
  into the next one.

See [keys.md](keys.md).

---

## Q5. Is there an equivalent of `TestSession.current()`?

No, and it is not needed. `TestSession.current()` exists because code that PicoContainer does not create (a
helper, a page factory) has no way to get the session injected, so the Java framework binds it to the thread.

Here every step receives its fixtures as arguments, so it passes what a helper needs:

```ts
// helper
export function scenarioName(data: ScenarioData, name: string): string { ... }

// step
await customersApi.create({ name: scenarioName(data, name), email: uniqueEmail() });
```

This also avoids the trouble `current()` has: it can't be called outside a scenario or on another thread by
mistake, and helpers are easy to unit-test (pass a `new ScenarioData()`).

If you really need ambient access (for example from deep inside a library you don't control), Node's
`AsyncLocalStorage` can play the part of the ThreadLocal, set in an auto fixture. Prefer passing the fixture.

---

## Q6. Does a scenario share anything with the scenario before it?

Not through fixtures. Per-scenario fixtures are new for every scenario. What a worker keeps between its
scenarios:

| Kept | Why it is safe |
|---|---|
| the browser process | each scenario gets a new **context**: no cookies, storage or pages are shared |
| the `mq` connection | it holds no scenario data; each receive opens its own receiver |
| module-level variables in your code | **not safe**, which is why scenario data never goes in them |
| imported JSON (locator files) | read-only |

---

## Q7. Why does an API-only scenario not open a browser page?

Because nothing asks for `page`. `customersApi` needs `context` (for `context.request`), so a browser context is
created, but a context without a page renders nothing. MQ-only scenarios ask for neither, so no context is
created at all. The `AfterStep` hook asks for `ui`, not `page`, for the same reason.

---

## Q8. If I have a new API endpoint, do I need a new class like `CustomersApi`?

**An endpoint of the customers service:** no, add a method to `CustomersApi`, plus a `...Response` variant if a
step will check its status.

**A new service:** yes, one client class per service, and a fixture for it. See [api.md](api.md#adding-a-service).

---

## Q9. Where do I put a breakpoint?

In the step or page object, as usual. Playwright runs the generated files in `.features-gen/`, which call your
step functions, so:

- VS Code with the **Playwright Test** extension: run `npx bddgen` once, then debug a test from the Testing view
  or from a file in `.features-gen/`. Breakpoints in `src/` are hit.
- `PWDEBUG=1` opens the Playwright Inspector and pauses before each browser action.
- `await page.pause()` in a step pauses there.

---

## Q10. Can I rename `data` (to `session`, `world`, `context` ...)?

Yes, but pick a name Playwright does not already use: `context`, `page`, `request` and `browser` are taken.
Rename the key in `ScenarioFixtures` and in `bddTest.extend({...})`, and every step's destructuring. Because
fixtures are injected by name, a step that still writes `{ data }` would then fail to compile: TypeScript checks
the names against the fixture types.

playwright-bdd also supports a Cucumber-style `this` world (`createBdd(test, { worldFixture: 'world' })`), if
you prefer `this.customer` over `data.get(Keys.CUSTOMER)`. This framework uses typed keys instead.
