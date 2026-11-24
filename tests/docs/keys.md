# Sharing data between steps: `data` and `Keys`

Steps of one scenario often live in different files: the API step that creates a customer is in
`steps/api/customers.steps.ts`, the GUI step that searches for it is in `steps/ui/customers.steps.ts`. They
share values through the **`data` fixture**, a [`ScenarioData`](../src/core/ScenarioData.ts), and every value
is stored under a **key** declared once in [src/core/keys.ts](../src/core/keys.ts).

This is the Java framework's `TestSession.data()` store with `Keys.java`, under another name.

```ts
// steps/api/customers.steps.ts: an API step stores the customer it created
data.put(Keys.CUSTOMER, await customersApi.create({ ... }));

// steps/ui/customers.steps.ts: a GUI step of the same scenario reads it
await customersPage.search(data.get(Keys.CUSTOMER).name);
```

## Why keys

A key is a `DataKey<T>`: a name plus the type of the value stored under it.

```ts
export const Keys = {
  CUSTOMER: DataKey.of<Customer>('customer'),
  RESPONSE: DataKey.of<APIResponse>('last API response'),
} as const;
```

| Without keys (`Map<string, any>`) | With `DataKey<T>` |
|---|---|
| `store.get('customer') as Customer`: a cast at every read | `data.get(Keys.CUSTOMER)` is a `Customer`, no cast |
| `store.set('customer', 'oops')` compiles and fails later | `data.put(Keys.CUSTOMER, 'oops')` does not compile |
| `'customer'` in one file, `'Customer'` in another: two values | every file uses the same constant |
| a missing value is `undefined`, the error shows up far away | `get` fails at once: `No "customer" in this scenario yet: an earlier step has to create or store it` |

The type travels with the key through a "phantom" field that is never set (`protected phantom?: T`), so
`DataKey<Customer>` and `DataKey<string>` are different types to the compiler. Keys are compared by object
identity, not by name: two keys with the same name are still two different keys, which is why every key is
declared once in `Keys`.

## The methods

| Method | Does | Returns |
|---|---|---|
| `put(key, value)` | stores or replaces the value | the value (so `data.put(...)` can be used inline) |
| `get(key)` | reads the value | the value; **throws** naming the key if nothing was stored |
| `find(key)` | reads a value that may be missing | the value or `undefined` |
| `has(key)` | checks | `true` / `false` |
| `add(key, item)` | for a `DataKey<T[]>`: appends to the list, creating it on first use | the list |

## The keys

| Key | Type | Written by | Read by |
|---|---|---|---|
| `SUFFIX` | `string` | `suffixOf(data)`, on first use | `scenarioName`, search steps, queue names |
| `CUSTOMER` | `Customer` | `Given a customer named {string} exists`, `I create a customer ... through the API`, `I add a customer named {string} through the form`, `I change the status ...` | every "that customer" step, API or GUI |
| `RESPONSE` | `APIResponse` | every API step that checks a status | `Then the API responds with status {int}`, response checks |
| `DESTINATIONS` | `Map<string, string>` | `Given a new queue/topic {string}` | every MQ step, to find the real queue name |
| `MESSAGE` | `ReceivedMessage` | every "read a message" step | `the message text/field/property ...` |
| `SUBSCRIPTIONS` | `Map<string, Subscription>` | `Given I subscribe to topic {string}` | `the subscription to topic ... receives ...` |

## Kinds of values

### One value

```ts
CUSTOMER: DataKey.of<Customer>('customer'),

data.put(Keys.CUSTOMER, customer);
const customer = data.get(Keys.CUSTOMER);           // throws if missing
if (data.has(Keys.CUSTOMER)) { ... }                 // when it is optional
```

### A list that steps add to

```ts
ORDER_IDS: DataKey.of<string[]>('order ids'),

data.add(Keys.ORDER_IDS, 'A-1');                     // creates the list on first use
data.add(Keys.ORDER_IDS, 'A-2');
const ids = data.find(Keys.ORDER_IDS) ?? [];         // [] if no step added any
```

### Values looked up by name (a map)

There is no map helper; create the map on first use with `find ?? put`, as the MQ steps do:

```ts
DESTINATIONS: DataKey.of<Map<string, string>>('queues and topics'),

const names = data.find(Keys.DESTINATIONS) ?? data.put(Keys.DESTINATIONS, new Map());
names.set('queue:orders', 'qa.orders.3f9c2a1b');
```

`get`, `find` and `add` return the stored object itself, not a copy. Changing a list or map you read changes
what later steps see, which is what the MQ steps rely on.

## Why there is no `clear()`

The Java framework's old style kept scenario data in static `ThreadLocal`s and needed a `clear()` after every
scenario. Here `data` is a fixture: Playwright creates a **new** `ScenarioData` for each scenario and drops it
when the scenario ends, pass or fail, retry or not. There is nothing to clear, for any key added later either.

| Moment | What happens to the data |
|---|---|
| a step first asks for `data` | Playwright creates a new, empty `ScenarioData` |
| steps run | every step of this scenario gets the same object |
| scenario ends | the object is dropped |
| next scenario on the same worker | a new, empty `ScenarioData` |
| a retry | runs in a new worker process: new objects for everything |

## Why the `Keys` object can be a module-level constant

A module-level `const` is shared by every scenario the worker runs. That is wrong for **data**, and right for
a **key**: a key only holds a name and a type, never changes, and is the same for every scenario. Think of it
as a label on a drawer; every scenario's `ScenarioData` has its own drawers.

## Using data outside a step

A helper that needs scenario data takes `data` as a parameter, like `suffixOf` and `scenarioName`:

```ts
export function scenarioName(data: ScenarioData, name: string): string {
  return `${name} ${suffixOf(data)}`;
}
```

The step passes its `data` in. There is no `TestSession.current()` equivalent, and none is needed: see
[explanation.md](explanation.md#q5-is-there-an-equivalent-of-testsessioncurrent).

## Adding a key

1. Add it to `Keys` in `core/keys.ts`, with a comment saying what it is:
   ```ts
   /** The order placed by "I place an order", read by the order page steps. */
   ORDER: DataKey.of<Order>('order'),
   ```
2. Give it a name no other key uses. The name appears in error messages.
3. Write with `put` or `add`, read with `get`, `find` or `has`, in any step that asks for `data`.

## What not to do

- **No module-level `let` for scenario data.** The value leaks into the next scenario on that worker.
- **No `new ScenarioData()` in a step.** It is a second, empty store that no other step sees.
- **No keys declared in step files.** Two files could declare `'customer'` with different types. Declare each
  key once, in `Keys`.

## Related

- [fixtures.md](fixtures.md): the `data` fixture among the others
- [unique-data.md](unique-data.md): `SUFFIX` and making names unique per scenario
- [api.md](api.md): how API and GUI steps share "that customer"
