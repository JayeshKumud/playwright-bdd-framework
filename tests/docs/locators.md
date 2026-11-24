# Locators in JSON files

Page objects hold no selectors. Each page (and each kind of grid) has one JSON file under
[src/pages/locators](../src/pages/locators), and the page object looks elements up by name when it uses them:

```ts
import locators from './locators/customers.json';

constructor(readonly page: Page) {
  this.el = new PageElements(page, locators, 'locators/customers.json');
}

async search(name: string): Promise<this> {
  await this.el.get('searchInput').fill(name);
  await this.el.get('searchButton').click();
  ...
}
```

When the app changes an id, you fix it in the JSON file and the TypeScript stays as it is.

## File format

```json
{
  "_comment": "Keys starting with _ are ignored.",

  "searchInput": { "selector": "#search-input", "description": "search by name input" },
  "addButton": "#add-customer-button",
  "row": "tr:has(td:text-is('NAME'))"
}
```

| Field | Default | Meaning |
|---|---|---|
| `selector` | required | any Playwright selector: CSS, `text=...`, `role=button[name="Save"]`, `xpath=...`, chained with `>>` |
| `description` | the name | readable name, from `el.describe(name)`, for failure messages |

A plain string (`"addButton": "#add-customer-button"`) is short for `{ "selector": "#add-customer-button" }`.

### Placeholders

A selector can hold placeholders in **upper case**. `get` replaces each one with the value given:

```json
"row": "tr:has(td:text-is('NAME'))",
"option": "role=option[name='OPTION']"
```

```ts
await this.el.get('row', { NAME: 'Ada Lovelace' }).click();
await this.el.get('option', { OPTION: 'Price Booking' }).click();
```

Single quotes in the value are escaped (`O'Brien` → `O\'Brien`), so values can be put between `'...'` in the
selector. Every occurrence of the placeholder is replaced; pick names that cannot appear in the rest of the
selector (`NAME`, not `a`).

## `PageElements`

[`PageElements`](../src/pages/PageElements.ts) binds one locator file to one `Page`:

| Method | Returns |
|---|---|
| `get(name, params?)` | a Playwright `Locator` for the element, placeholders replaced |
| `selector(name, params?)` | the selector string, for building other selectors (used by `GridLibrary`) |
| `describe(name)` | the description, or the name |

- **Looked up on use.** `el.get('searchInput')` is called every time the element is used. A `Locator` is lazy
  anyway: it finds the element when an action or assertion runs, and waits for it.
- **Typos fail clearly.** An unknown name fails with `"serchInput" is not in the locators/customers.json; add it there`.
- **The file is imported** (`import locators from './locators/customers.json'`, with `resolveJsonModule` in
  `tsconfig.json`), so a wrong file name is a compile error, and the file is read once per worker.

## Compared with the Java framework

| Java | Here |
|---|---|
| `src/main/resources/locators/<page>.json` | `src/pages/locators/<page>.json` |
| `LocatorRepository` reads and caches the file | `import` of the JSON file (cached by Node) |
| `new PageElements(page, healer, "customers")` | `new PageElements(page, locators, 'locators/customers.json')` |
| `el.get(name)` → `Locator` | the same |
| `el.within(parent, name)` | `parent.locator(this.el.selector(name))` |
| `"heal": true / false` | — (no self-healing) |
| placeholders | upper-case placeholders: `get('row', { NAME: ... })` |

## Adding elements

1. Find a selector that matches exactly one element (see [locator-guide.md](locator-guide.md)).
2. Add it to the page's file with a description.
3. Use it in the page object: `this.el.get('name')`.

`npm run typecheck` does not check element names (they are strings); a wrong name fails when the step runs.
