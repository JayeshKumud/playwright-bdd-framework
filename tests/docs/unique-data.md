# Unique test data

Scenarios run in parallel and often against a shared environment, so the data they create must never clash.
The Java framework does this with `{unique}` in feature files (`Variables`) and the `BASE_UNIQUE` map. This
framework makes names unique **in the steps**, so the feature files keep readable names.

## The helpers

[src/core/unique.ts](../src/core/unique.ts) has the functions that need no scenario:

| Function | Returns | Example |
|---|---|---|
| `uniqueSuffix()` | 8 random hex characters | `3f9c2a1b` |
| `unique(text)` | the text with a new suffix | `unique('Ada Lovelace')` → `Ada Lovelace 3f9c2a1b` |
| `uniqueEmail(prefix = 'qa')` | an address on `example.com`, which never receives mail | `qa.3f9c2a1b@example.com` |

[src/core/keys.ts](../src/core/keys.ts) has the ones tied to a scenario:

| Function | Returns |
|---|---|
| `suffixOf(data)` | **the** suffix of this scenario: created on first use, stored under `Keys.SUFFIX`, the same for every later call |
| `scenarioName(data, name)` | `name` plus the scenario's suffix: `Ada Lovelace 3f9c2a1b` |

## One suffix per scenario

Every name a scenario creates gets the **same** suffix. That lets a step find exactly this scenario's data, and
nothing else, by searching for the suffix:

```gherkin
Given these customers exist:
  | name          | status   |
  | Ada Lovelace  | active   |       # stored as "Ada Lovelace 3f9c2a1b"
  | Alan Turing   | inactive |       # stored as "Alan Turing 3f9c2a1b"
When I search the customers page for this scenario's customers     # searches for "3f9c2a1b"
Then the grid column "Name" shows
  | Ada Lovelace |                   # compared as "Ada Lovelace 3f9c2a1b"
  | Alan Turing  |
```

```ts
When("I search the customers page for this scenario's customers", async ({ customersPage, data }) => {
  await customersPage.open();
  await customersPage.search(suffixOf(data));
});
```

Steps that compare names from the feature apply `scenarioName` to the expected values too, so the feature never
shows the suffix.

## Queues and topics

The MQ steps use the suffix for destinations the scenario owns:

```gherkin
Given a new queue "orders"        # the scenario uses queue "qa.orders.3f9c2a1b"
When I send the JSON message to queue "orders": ...
```

A queue named **without** the `a new queue` step is used as it is: that is how a scenario reads your
application's real queues. See [messaging.md](messaging.md#isolation).

## Compared with the Java framework

| Java | Here |
|---|---|
| `{unique}` in a feature file, replaced by `Variables` | no placeholder; the step calls `scenarioName(data, name)` |
| `${name}` values saved by one step and used in later feature lines | not built; steps share values through `data` (see [keys.md](keys.md)) |
| `BASE_UNIQUE` map in `TestSession` | `Keys.SUFFIX` in `data`, plus any key you add |
| `UniqueData` | `unique()`, `uniqueEmail()` |
| static `ThreadLocal` + `clear()` (old style) | the `data` fixture, new for each scenario: nothing to clear |

If you need `${name}`-style values in features, add a step that stores a value under a `Map<string, string>`
key and a helper that replaces `${name}` in step arguments. Keep it in `core/`, next to `keys.ts`.

## Rules

- **Make every created name unique.** Use `scenarioName(data, ...)` for names the scenario looks up again, and
  `uniqueEmail()` for fields that must be unique but are never compared.
- **Don't search by a plain name** like `Ada Lovelace` in a shared environment: other runs may have created one.
  Search for `data.get(Keys.CUSTOMER).name` or `suffixOf(data)`.
- **Clean up anyway.** Unique names stop clashes; they don't stop the database from filling up. Track what you
  create (see [api.md](api.md#clean-up)).
