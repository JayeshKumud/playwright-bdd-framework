import { expect, Locator, Page } from '@playwright/test';
import { LocatorFile, PageElements } from './PageElements';
import agGridLocators from './locators/grid.ag-grid.json';

/** The element types {@link GridLibrary.elements} knows; anything else is used as a CSS selector. */
export const ELEMENT_TYPES = ['checkbox', 'radio', 'button', 'link', 'input', 'dropdown', 'image'] as const;

/**
 * The values a row must show, as { header: value }: `{ Name: 'COE', Role: 'Admin' }` is the row whose Name is
 * "COE" and whose Role is "Admin".
 */
export type RowMatch = Record<string, string>;

/**
 * A data grid, with the same functions for every page (the same as agentic-qa-java's GridLibrary). Columns are
 * named by their header text, so tests never deal with column ids. Rows are found by a {@link RowMatch}, and every
 * function returns all the rows that show all its values:
 *
 *   const grid = await customersPage.grid().waitUntilLoaded();
 *   await grid.cells('Name', 'Ada Lovelace');                           // the Name cells showing "Ada Lovelace"
 *   await grid.rows({ Name: 'COE', Role: 'Admin' });                    // every row matching both columns
 *   await grid.cells({ Name: 'COE' }, 'Status');                        // the Status cells of those rows
 *   await grid.values({ Role: 'Admin' }, 'Name');                       // the Name of every Admin row
 *   await grid.elements({ Booking: 'Booking A' }, 'checkbox');          // the checkboxes in those rows
 *   await grid.elements({ Booking: 'Booking A' }, 'link', 'Customer');  // ... in their Customer column
 *   await grid.columnValues('Name');                                    // all names shown
 *
 * A cell shows its text, or, if it holds a text input, textarea or dropdown, that field's value (a dropdown: its
 * selected option's text); checkboxes, radios and hidden inputs are left out. Values are compared by
 * {@link sameValue}: whitespace collapsed and trimmed, and numbers by value, so "70" matches "70.00".
 *
 * A lookup by value looks once and points at the cells or rows it found there (by row-index, or by position in a
 * plain table): look again after the grid refreshes, sorts or filters, instead of reusing an old locator.
 *
 * Lookups are async because a column is resolved from its header first: by the header's col-id when it has one
 * (AG Grid), else by its position under the header (a plain HTML table). The selectors come from a locator file:
 * locators/grid.ag-grid.json by default, or one per grid such as locators/grid.customers-table.json.
 * Rows that share a row-index (AG Grid's pinned and scrolling parts) are returned together.
 */
export class GridLibrary {
  private readonly el: PageElements;
  private readonly columnKeys = new Map<string, string>();

  /**
   * @param page     the window the grid is in
   * @param locators the grid's locator file, AG Grid by default
   */
  constructor(
    private readonly page: Page,
    private readonly locators: LocatorFile = agGridLocators,
  ) {
    this.el = new PageElements(page, locators, 'grid locator file');
  }

  /**
   * Waits until the grid has loaded: grid and header shown, loading overlay gone (if the grid has one), and a row
   * or the "no rows" message shown.
   */
  async waitUntilLoaded(): Promise<this> {
    await expect(this.el.get('root'), 'the grid is shown').toBeVisible();
    await expect(this.el.get('header'), "the grid's header is shown").toBeVisible();
    if (this.locators.loadingOverlay) {
      await expect(this.el.get('loadingOverlay'), 'the grid has finished loading').toBeHidden();
    }
    await expect(this.el.get('rowsOrNoRows').first(), 'a grid row or the "no rows" message is shown').toBeVisible();
    return this;
  }

  /**
   * Searches a column for a value: the cells of column `header` that show `value` (see {@link sameValue}). Looks
   * once, without waiting; use {@link contains} to wait for a value.
   */
  cells(header: string, value: string): Promise<Locator>;
  /** The cells of column `targetHeader` in every row that shows all the values of `match`, top to bottom. */
  cells(match: RowMatch, targetHeader: string): Promise<Locator>;
  async cells(a: string | RowMatch, b: string): Promise<Locator> {
    if (typeof a === 'string') {
      return this.matchingCells(this.el.get('row').locator(await this.cellSelector(a)), b);
    }
    return (await this.rows(a)).locator(await this.cellSelector(b));
  }

  /** Searches the whole grid for a value: every cell, in any column, that shows `value`. Looks once. */
  async cellWithValue(value: string): Promise<Locator> {
    return this.matchingCells(this.el.get('row').locator(this.el.selector('cell')), value);
  }

  /** Tells whether column `header` shows `value`, waiting up to the expect timeout for it. */
  async contains(header: string, value: string): Promise<boolean> {
    const cells = this.el.get('row').locator(await this.cellSelector(header));
    try {
      await expect.poll(async () => (await this.scan(cells, value)).some((c) => c.matches)).toBe(true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Every row that shows all the values of `match`, top to bottom: all their parts if the grid splits rows (AG
   * Grid row-index). Waits until at least one row matches, and fails if none does.
   */
  async rows(match: RowMatch): Promise<Locator> {
    return this.matchRows(match);
  }

  /**
   * What column `targetHeader` shows in every row that shows all the values of `match`, top to bottom, trimmed:
   * the cell's text, or the value of the text input, textarea or dropdown it holds.
   */
  async values(match: RowMatch, targetHeader: string): Promise<string[]> {
    return (await this.scan(await this.cells(match, targetHeader))).map((c) => c.value.trim());
  }

  /**
   * Every element of a type in every row that shows all the values of `match`: anywhere in the rows, or in column
   * `targetHeader`. `elementType` is one of {@link ELEMENT_TYPES} (case ignored) or a CSS selector: a tag
   * ("span"), a class (".ag-icon") or an attribute ("[data-testid='edit']"). Use `.all()` to act on each,
   * `.first()` for one.
   */
  elements(match: RowMatch, elementType: string): Promise<Locator>;
  elements(match: RowMatch, elementType: string, targetHeader: string): Promise<Locator>;
  async elements(match: RowMatch, elementType: string, targetHeader?: string): Promise<Locator> {
    const scope = targetHeader === undefined ? await this.rows(match) : await this.cells(match, targetHeader);
    return scope.locator(this.elementSelector(elementType));
  }

  /**
   * What a column shows, top to bottom (the rows the grid has rendered), trimmed: each cell's text, or the value
   * of the text input, textarea or dropdown it holds.
   */
  async columnValues(header: string): Promise<string[]> {
    const cells = this.el.get('row').locator(await this.cellSelector(header));
    return (await this.scan(cells)).map((c) => c.value.trim());
  }

  /**
   * Finds the rows showing every value of `match`, waiting until there is one. AG Grid rows match when their parts
   * sharing a row-index do (a pinned and a scrolling part); rows without a row-index (a plain table) must show all
   * the values themselves.
   */
  private async matchRows(match: RowMatch): Promise<Locator> {
    const entries = Object.entries(match);
    if (entries.length === 0) throw new Error('A grid row match needs at least one column and value');
    const rows = this.el.get('row');
    const columns: [Locator, string][] = [];
    for (const [header, value] of entries) columns.push([rows.locator(await this.cellSelector(header)), value]);
    let keys: string[] = [];
    await expect
      .poll(
        async () => {
          const perColumn = await Promise.all(
            columns.map(async ([cells, value]) =>
              (await this.scan(cells, value)).filter((c) => c.matches).map((c) => c.rowKey),
            ),
          );
          keys = [...new Set(perColumn[0])].filter((key) => perColumn.every((list) => list.includes(key)));
          return keys.length > 0;
        },
        { message: `a grid row where ${describe(match)} is shown` },
      )
      .toBe(true);
    return keys
      .map((key) =>
        key.startsWith('index:')
          ? this.page.locator(`${this.el.selector('row')}[row-index='${key.slice('index:'.length)}']`)
          : rows.nth(Number(key.slice('position:'.length))),
      )
      .reduce((all, next) => all.or(next));
  }

  /** The cells of `cells` that show `value`, as they are now; a locator matching nothing if there are none. */
  private async matchingCells(cells: Locator, value: string): Promise<Locator> {
    const found = (await this.scan(cells, value)).flatMap((c, i) => (c.matches ? [cells.nth(i)] : []));
    return found.length === 0 ? this.page.locator(':not(*)') : found.reduce((all, next) => all.or(next));
  }

  /** What each cell of `cells` shows and, if `value` is given, whether it shows it (see {@link scanCells}). */
  private scan(cells: Locator, value?: string): Promise<ScannedCell[]> {
    return cells.evaluateAll(scanCells, { rowSelector: this.el.selector('row'), want: value ?? null });
  }

  /** The selector of a column's cells, by col-id or by the header's position. */
  private async cellSelector(header: string): Promise<string> {
    return this.el.selector('cell') + (await this.columnKey(header));
  }

  /**
   * Reads a column's key from its header once per grid object: [col-id='...'] when the header has a col-id, else
   * :nth-child(n) by its position among the header cells.
   */
  private async columnKey(header: string): Promise<string> {
    const known = this.columnKeys.get(header);
    if (known !== undefined) return known;
    const headerCell = this.el.get('headerCell', { HEADER: header }).first();
    await expect(headerCell, `the grid column "${header}" is shown`).toBeVisible();
    const colId = await headerCell.getAttribute('col-id');
    const key = colId
      ? `[col-id='${colId}']`
      : `:nth-child(${await headerCell.evaluate((h) => Array.from(h.parentElement!.children).indexOf(h) + 1)})`;
    this.columnKeys.set(header, key);
    return key;
  }

  /** The selector for an element type from the locator file, or the text itself as a CSS selector. */
  private elementSelector(elementType: string): string {
    const name = elementType.trim().toLowerCase();
    return (ELEMENT_TYPES as readonly string[]).includes(name) ? this.el.selector(name) : elementType.trim();
  }
}

/** `"Name" is "COE" and "Role" is "Admin"`, for messages. */
function describe(match: RowMatch): string {
  return Object.entries(match)
    .map(([header, value]) => `"${header}" is "${value}"`)
    .join(' and ');
}

/**
 * Tells whether a value a cell shows is the expected one: the same text once whitespace is collapsed and trimmed,
 * or, when both are numbers, the same number, so "70" matches "70.00" and "1,234.5" matches "1234.50". A number has
 * an optional sign, digits (thousands may be grouped with commas) and optional decimals; "$70" or "70 USD" is text.
 * The grid's lookups match the same way (scanCells has its own copy, as it runs in the browser).
 */
export function sameValue(actual: string, expected: string): boolean {
  const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();
  const number = (s: string) =>
    /^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(s) && /\d/.test(s) ? Number(s.replace(/,/g, '')) : null;
  const a = norm(actual);
  const e = norm(expected);
  if (a === e) return true;
  const aNumber = number(a);
  return aNumber !== null && aNumber === number(e);
}

/** A cell as {@link scanCells} sees it. */
interface ScannedCell {
  /** What the cell shows, untrimmed: its fields' values joined by a space, or its text if it holds none. */
  value: string;
  /** Whether it shows the wanted value (false when none was given). */
  matches: boolean;
  /** Its row: "index:<row-index>" for an AG Grid row, else "position:<n>" among all the grid's rows. */
  rowKey: string;
}

/**
 * Runs in the browser, over a grid's cells: what each one shows and whether it shows `want`, compared as
 * {@link sameValue} does. A cell shows the values of the text inputs, textareas and dropdowns it holds (a dropdown:
 * its selected option's text; checkboxes, radios and hidden inputs are left out), or its text if it holds none, and
 * matches when its text or one of its fields is `want`. It must not use anything outside itself: Playwright sends
 * its source to the page.
 */
function scanCells(
  cells: Element[],
  { rowSelector, want }: { rowSelector: string; want: string | null },
): ScannedCell[] {
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  const number = (s: string) =>
    /^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(s) && /\d/.test(s) ? Number(s.replace(/,/g, '')) : null;
  const target = norm(want);
  const targetNumber = number(target);
  const same = (s: string | null) => {
    const text = norm(s);
    return text === target || (targetNumber !== null && number(text) === targetNumber);
  };
  const shown = (f: Element) =>
    f instanceof HTMLSelectElement
      ? Array.from(f.selectedOptions)
          .map((o) => o.textContent ?? '')
          .join(' ')
      : (f as HTMLInputElement | HTMLTextAreaElement).value;
  const allRows = Array.from(document.querySelectorAll(rowSelector));
  return cells.map((cell) => {
    const fields = Array.from(
      cell.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select'),
    );
    const row = cell.closest(rowSelector);
    const rowIndex = row?.getAttribute('row-index');
    return {
      value: fields.length ? fields.map(shown).join(' ') : (cell.textContent ?? ''),
      matches: want !== null && (same(cell.textContent) || fields.some((f) => same(shown(f)))),
      rowKey: rowIndex != null ? `index:${rowIndex}` : `position:${row ? allRows.indexOf(row) : -1}`,
    };
  });
}
