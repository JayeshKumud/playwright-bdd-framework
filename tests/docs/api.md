# API clients

API calls are made by **API client classes**, one per service, such as
[`CustomersApi`](../src/api/CustomersApi.ts). Steps get the client as a fixture (`customersApi`). It calls the
service through **the scenario's browser context** (`context.request`), so API steps and GUI steps of a scenario
share cookies and session: log in through the GUI and call the API as that user, or the other way round.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `CustomersApi` | `src/api/CustomersApi.ts` | One method per call. Typed body methods check the status; `...Response` methods return the raw response |
| `Customer`, `CustomerInput` | `src/api/CustomersApi.ts` | The response body and the request body, as TypeScript types |
| `ApiLog` | `src/api/ApiLog.ts` | Records every call of the scenario; attached to the report when the scenario fails |
| `customersApi` fixture | `src/fixtures/test.ts` | Creates the client on `context.request`; deletes tracked customers after the scenario |
| Steps | `src/steps/api/customers.steps.ts` | Call the client and store results in `data` |
| Base URL | `BASE_URL` in `env/<TEST_ENV>.env` | `use.baseURL` in `playwright.config.ts`; paths like `/customers` are relative to it |

## Compared with the Java API classes

| Java (`CustomerApi`, `ApiFactory`) | Here (`CustomersApi`, fixture) |
|---|---|
| REST Assured, its own HTTP client | Playwright `APIRequestContext` of the scenario's browser context |
| does not share the browser's cookies | shares them: same session as the GUI steps |
| `ApiFactory.getApi(...)`: one instance for the whole run | one instance **per scenario**, from the fixture |
| no per-scenario state allowed | can keep per-scenario state (the tracked ids) |
| `Assert.fail` on an unexpected status | `expect(response.status(), ...).toBe(201)` with the body in the message |
| `Response` + `.as(Customer.class)` (Jackson) | `APIResponse` + `response.json()` typed as `Customer` |
| model classes with getters and setters | `type Customer = { id: number; name: string; ... }` |
| `baseUrl + customersPath` from `Settings.getBaseUrl()` | a relative path; Playwright adds `baseURL` |
| `ServiceCleanup.add(...)` for each created customer | `create()` tracks the id; the fixture deletes it |

## The client

```ts
export class CustomersApi {
  static readonly PATH = '/customers';
  private readonly tracked = new Set<number>();

  constructor(private readonly request: APIRequestContext, private readonly log: ApiLog) {}

  /** Checks the status, returns the typed body, and has the customer deleted after the scenario. */
  async create(input: CustomerInput): Promise<Customer> {
    const customer = await this.ok<Customer>(await this.createResponse(input), 201);
    this.track(customer.id);
    return customer;
  }

  /** The raw response, for steps that check status codes (201, 422, ...). */
  async createResponse(input: CustomerInput): Promise<APIResponse> {
    return this.log.record('POST', await this.request.post(CustomersApi.PATH, { data: input }));
  }

  private async ok<T>(response: APIResponse, status: number): Promise<T> {
    expect(response.status(), `${response.url()} status (body: ${await response.text()})`).toBe(status);
    return (await response.json()) as T;
  }
}
```

Two methods per call:

| Method | For | On an unexpected status |
|---|---|---|
| `create`, `get`, `list`, `update` | steps that **need** the call to work (set-up, follow-up checks) | fails the step, with URL and body |
| `createResponse`, `getResponse`, `listResponse`, `deleteResponse` | steps that **check** the status (`Then the API responds with status 422`) | returns the response |

Every call goes through `this.log.record(...)`, so a failed scenario's report shows each request with its status
and body (cut at 4000 characters).

## Sharing data between API and GUI steps

| Key | Written by | Read by |
|---|---|---|
| `Keys.CUSTOMER` | API steps (created or updated customer), GUI step "I add a customer ... through the form" | API checks by id, GUI search and grid checks |
| `Keys.RESPONSE` | API steps that check a status | `Then the API responds with status {int}` and the response checks |

```gherkin
Given a customer named "Ada Lovelace" exists                       # API: stores the customer
When I search the customers page for that customer                 # GUI: searches for its name
Then the results show only that customer with status "active"      # GUI: grid row compared with it
```

See `features/e2e/customer_journey.feature` and [keys.md](keys.md).

## Clean-up

Whatever a scenario creates is deleted after it, pass or fail:

- `customersApi.create(...)` tracks the new id itself.
- A customer created another way (the GUI form, a message) is tracked with `customersApi.track(id)`. The form
  step looks the customer up by its unique name to get the id.
- After the scenario, the `customersApi` fixture deletes the tracked customers, newest first, **before** the
  browser context closes, so the deletes still have the scenario's session.
- `deleteIfExists` accepts 204 and 404: a scenario that deleted the customer itself is fine.
- A failing delete doesn't hide the scenario's result. It is attached to the report as `clean-up failures`.

For resources that are not customers, register an action with the `cleanup` fixture:

```ts
cleanup.add(`delete order ${id}`, () => ordersApi.delete(id));
```

## Adding an endpoint

A new endpoint of the customers service is a new method on `CustomersApi`, in the same style:

```ts
async search(name: string): Promise<Customer[]> {
  return this.ok(await this.log.record('GET', await this.request.get(`${CustomersApi.PATH}/search`, { params: { name } })), 200);
}
```

## Adding a service

1. `src/api/OrdersApi.ts`: a class with `(request: APIRequestContext, log: ApiLog)`, its types, and the methods.
   Copy `track` / `deleteTracked` if it creates data.
2. A fixture in `src/fixtures/test.ts`:
   ```ts
   ordersApi: async ({ context, apiLog }, use, testInfo) => {
     const api = new OrdersApi(context.request, apiLog);
     await use(api);
     const failures = await api.deleteTracked();
     if (failures.length) await testInfo.attach('clean-up failures', { body: failures.join('\n'), contentType: 'text/plain' });
   },
   ```
   and its type in `ScenarioFixtures`.
3. Steps in `src/steps/api/orders.steps.ts` that ask for `ordersApi` and store results in `data`.

A service on **another host** passes full URLs (`request.get('https://orders.example.com/orders')`), or gets its
own `request.newContext({ baseURL })`. Note that a new request context does **not** share the browser's cookies.

## Things to know

- **API-only scenarios don't open a page.** `customersApi` needs `context`, so a browser context is created,
  but no page is opened and nothing is rendered.
- **Routing doesn't affect API calls.** `backendMock` routes the browser's traffic; `context.request` calls go
  to the real backend. See [backend-mock.md](backend-mock.md).
- **Test the API's errors with `...Response` methods.** `create` would fail the step on a 422 before your
  `Then` could check it.
