# Finding and writing locators

How to find an element in the browser, choose a selector that keeps working, and write it in a locator file.

## 1. How a locator gets used

```
locators/customers.json   "searchInput": "#search-input"
        │
PageElements.get('searchInput')  →  page.locator('#search-input')   (a lazy Locator: nothing searched yet)
        │
.fill('Ada')                     →  waits until exactly one element matches, is visible and editable,
                                    up to ACTION_TIMEOUT_MS, then types
```

Playwright locators are **strict**: an action fails if the selector matches more than one element. That is a
feature: it shows that a selector is not specific enough. Use `.first()` only when any of the matches will do.

## 2. Finding the element

### Let Playwright suggest one (codegen)

```bash
npx playwright codegen http://127.0.0.1:8000
```

Click the element; codegen shows the locator it would use (`getByRole('button', { name: 'Search' })`). Turn it
into a selector string (section 4).

### Pick it in the inspector

Run a scenario with `PWDEBUG=1` (PowerShell: `$env:PWDEBUG='1'`). The Playwright Inspector opens; its
**Pick locator** button shows a locator for whatever you hover, and you can type a selector to see what it matches.

### DevTools

Right-click → Inspect. In the Console, `document.querySelectorAll('#customers-table tr.customer-row').length`
tells how many elements a CSS selector matches. It must be 1 for an action (or the count you expect for a list).

## 3. Which selector to choose

In order of preference:

| Kind | Example | Why |
|---|---|---|
| test id | `[data-testid='save']` | made for tests; does not change with layout or text |
| role and name | `role=button[name='Save']` | what the user sees; also checks accessibility |
| a stable id | `#search-input` | short and unique, if the app does not generate it |
| label or placeholder | `[placeholder='Search by name']` | what the user reads |
| text | `text=No customers found.` | for messages; breaks when the wording changes |
| CSS structure | `#customers-table tbody tr.customer-row` | for rows and lists |
| XPath | `xpath=//td[2]` | last resort |

Avoid generated ids (`#ember123`, `#mat-input-7`), long CSS paths (`div > div:nth-child(3) > span`) and
styling classes (`.btn-primary`).

## 4. Selector strings

`PageElements` takes selector strings, so the `getBy...` methods are written as their string forms:

| Method | String |
|---|---|
| `getByRole('button', { name: 'Save' })` | `role=button[name='Save']` |
| `getByRole('button', { name: 'Save', exact: true })` | `role=button[name='Save' s]` |
| `getByText('Saved')` | `text=Saved` |
| `getByText('Saved', { exact: true })` | `text="Saved"` |
| `getByTestId('save')` | `[data-testid='save']` (or `internal:testid=[data-testid="save"s]`) |
| `getByPlaceholder('Search')` | `[placeholder='Search']` |
| `getByLabel('Email')` | `internal:label="Email"i` |

Useful Playwright CSS extensions:

| Selector | Matches |
|---|---|
| `td:text-is('Ada')` | a `td` whose whole text is `Ada` |
| `td:has-text('Ada')` | a `td` containing `Ada` (case-insensitive) |
| `tr:has(td:text-is('Ada'))` | a row with such a cell |
| `button:visible` | only visible buttons |
| `#form >> role=button[name='Save']` | the Save button inside `#form` |

## 5. Writing it in JSON

### Quotes

JSON strings use double quotes, so use **single quotes inside the selector**:

```json
"save": "role=button[name='Save']"
```

If you need a double quote, escape it: `"text=\"Saved\""`.

### One entry for many elements (placeholders)

```json
"rowByName": "#customers-table tr:has(td:text-is('NAME'))"
```

```ts
this.el.get('rowByName', { NAME: customer.name });
```

### An element inside another one

```json
"row": "#customers-table tbody tr.customer-row",
"rowName": ".col-name"
```

```ts
const row = this.el.get('row').filter({ hasText: name });
await expect(row.locator(this.el.selector('rowName'))).toHaveText(name);
```

### A cell or button in a grid row

Use [`GridLibrary`](page-objects.md#grids-gridlibrary) instead of writing row selectors yourself:

```ts
await grid.elements({ Name: 'Ada Lovelace' }, 'button', 'Actions');
```

## 6. Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| `strict mode violation: ... resolved to 3 elements` | selector too broad | add the parent, a role name, or `:text-is` |
| timeout waiting for the locator | wrong selector, element in a popup, or not shown yet | check it in the inspector; for a popup use `windows.open` |
| works locally, fails in CI | generated id, or different viewport | use a stable attribute; check `VIEWPORT_WIDTH` |
| `"x" is not in the locators/....json` | name typo, or the element is in another page's file | check the file the page object imports |
| text match fails on `"Ada "` | extra spaces | `:text-is` trims; `GridLibrary` ignores spaces around values |

## 7. Checking a locator

- In a step, `await expect(locator).toHaveCount(1)` proves it is unique.
- `npm run test:headed -- --grep "my scenario"` shows the browser.
- `PWDEBUG=1` pauses before each action and highlights the element.
- A failed scenario's trace (`npm run report:html`, then the trace) shows the DOM at every action, so you
  can try selectors against the page as it was.
