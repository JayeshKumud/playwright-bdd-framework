# Testing a frontend with a mocked backend

The **`backendMock` fixture** ([`BackendMock`](../src/mock/BackendMock.ts)) answers the frontend's backend calls
with mock responses. Use it to test a frontend before its backend exists, or with backend states that are hard
to create for real: errors, empty lists, slow answers.

```gherkin
Given the backend is mocked with "customers-list"                 # mocks/backend/customers-list.json
And the backend answers GET "/api/customers" with status 500      # override one endpoint
When I open the customers app
Then the app status says "Could not load customers (500)"
```

## Mock files

`mocks/backend/<name>.json` is a list of endpoints:

```json
[
  {
    "method": "GET",
    "url": "/api/customers",
    "status": 200,
    "json": [{ "id": 1, "name": "Ada Lovelace", "email": "ada@example.com", "status": "active" }]
  },
  { "method": "POST", "url": "/api/customers", "status": 201, "json": { "id": 4, "name": "Katherine Johnson" } }
]
```

| Field | Default | Meaning |
|---|---|---|
| `url` | required | a path (`/api/customers`, made absolute against `BASE_URL`), a glob (`**/api/customers*`) or a full URL |
| `method` | any | only this HTTP method; other methods fall through to the next route |
| `status` | `200` | response status |
| `json` / `body` | empty body | response body, as JSON or as text |
| `headers` | none | response headers |
| `delayMs` | none | wait before answering, to test spinners and timeouts |

## The class

```ts
await backendMock.blockUnmocked('**/api/**');                 // first: a 501 for every call no mock answers
await backendMock.useFile('customers-list');                  // the endpoints of a mock file
await backendMock.mock({ method: 'GET', url: '/api/customers', status: 500, json: { detail: 'down' } });

backendMock.calls('POST', '/api/customers');                  // what the frontend sent, with parsed bodies
backendMock.unmockedCalls();                                  // calls that hit blockUnmocked
```

- **The last mock added wins.** Playwright tries the routes added last first. That is why `blockUnmocked` is
  added before the mocks, and why a step can override one endpoint of a mock file.
- **Unmocked calls fail fast**, with status 501 and `Not mocked: GET http://...`, instead of timing out against
  a backend that does not exist. `Then the frontend called no unmocked backend endpoint` checks that none happened.
- **The whole context is routed**, so popups opened by the scenario are mocked too.
- **API steps are not mocked.** `context.request` calls are not intercepted by routing, so `customersApi` still
  reaches the real backend in the same scenario.
- **Calls are recorded**, so a step can check what the frontend sent:
  `Then the frontend sent POST "/api/customers" with "name" = "Katherine Johnson"`. It polls, because the
  request may still be on its way when the step starts.

## The example

[features/ui/frontend_mocked_backend.feature](../features/ui/frontend_mocked_backend.feature) tests the demo
single-page app in [mocks/demo-frontend/index.html](../mocks/demo-frontend/index.html). The sample backend has
no such page, so `Given the demo frontend is served` (`CustomersAppPage.serveDemo()`) serves the HTML at
`/demo/customers-app` through a route. `npm run test:mock` needs no backend running at all.

## For your own frontend

1. Write a page object for it, and give it a fixture (see [page-objects.md](page-objects.md#adding-a-page)).
2. Drop `serveDemo` and the `the demo frontend is served` background: open the real URL.
3. Put mock files for its endpoints in `mocks/backend/`.
4. Keep the mock steps (`the backend is mocked with ...`, `the backend answers ...`, `the frontend sent ...`) as
   they are.

Mock the URL the **browser** calls. If the frontend calls a backend on another host, use a glob or a full URL
in `url`, and pass the same pattern to `blockUnmocked`.
