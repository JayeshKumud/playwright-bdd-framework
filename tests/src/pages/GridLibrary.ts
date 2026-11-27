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
 *   await grid.cellIn(rows, 'Price');                                   // the Price cell of rows you have
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
 *
 * Every lookup searches inside one grid (its `root` in the locator file), never the whole page, so a page with two
 * grids cannot mix their rows (both have a row-index 0). `price.grid()` is the window's only grid, or the one
 * picked for the window with {@link useGrid} (the step "I use the grid with column ..."); `price.grid('Booking')`
 * is the grid with a Booking column. The same as agentic-qa-java (docs/multiple-grids.md there).
 */
export class GridLibrary {
  private readonly el: PageElements;
  private readonly columnKeys = new Map<string, string>();
  /** The grid this library works on: every lookup is inside it. */
  private readonly gridRoot: Locator;

  /**
   * @param page     the window the grid is in
   * @param locators the grid's locator file, AG Grid by default
   * @param column   the header text of a column only this grid has, for windows with several grids; by default
   *                 the column picked for the window with {@link useGrid}, else none (the window's only grid)
   */
  constructor(
    private readonly page: Page,
    private readonly locators: LocatorFile = agGridLocators,
    private readonly column: string | undefined = chosenGridColumn(page),
  ) {
    this.el = new PageElements(page, locators, 'grid locator file');
    const all = this.el.get('root');
    this.gridRoot =
      column === undefined ? all : all.filter({ has: this.el.get('headerCell', { HEADER: column }) });
  }

  /**
   * The grid element itself (`root` in the locator file, AG Grid's `.ag-root-wrapper`), for anything this class
   * has no method for. Searches from it stay inside this grid:
   *
   *   const bookings = (await price.grid('Booking').waitUntilLoaded()).root();
   *   await bookings.locator("button:has-text('Export')").click();   // that grid's Export button only
   *
   * Call {@link waitUntilLoaded} first if the grid may still be loading; it also fails clearly if the choice finds
   * several grids.
   */
  root(): Locator {
    return this.gridRoot;
  }

  /**
   * Waits until the grid has loaded: grid and header shown, loading overlay gone (if the grid has one), and a row
   * or the "no rows" message shown. Fails clearly when the window has several grids and none was picked, or when
   * several grids have the picked column.
   */
  async waitUntilLoaded(): Promise<this> {
    await expect(this.gridRoot.first(), `${this.name()} is shown`).toBeVisible();
    const grids = await this.gridRoot.count();
    if (grids > 1) {
      throw new Error(
        this.column === undefined
          ? `${grids} grids on ${this.page.url()}: pick one by a column only it has, with the step ` +
              `'I use the grid with column "Booking"' or price.grid('Booking')`
          : `${grids} grids have a "${this.column}" column on ${this.page.url()}: pick the grid by a column only it has`,
      );
    }
    await expect(this.inGrid('header'), `the header of ${this.name()} is shown`).toBeVisible();
    if (this.locators.loadingOverlay) {
      await expect(this.inGrid('loadingOverlay'), `${this.name()} has finished loading`).toBeHidden();
    }
    await expect(
      this.inGrid('rowsOrNoRows').first(),
      `a row or the "no rows" message of ${this.name()} is shown`,
    ).toBeVisible();
    return this;
  }

  /** "the grid", or 'the grid with the column "Booking"', for messages. */
  private name(): string {
    return this.column === undefined ? 'the grid' : `the grid with the column "${this.column}"`;
  }

  /** An element of the locator file, searched inside this grid. */
  private inGrid(name: string, params: Record<string, string> = {}): Locator {
    return this.gridRoot.locator(this.el.selector(name, params));
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
      return this.matchingCells(this.inGrid('row').locator(await this.cellSelector(a)), b);
    }
    return this.cellIn(await this.rows(a), b);
  }

  /**
   * The cell of column `targetHeader` in a row you already have, for example from {@link rows}:
   * `await grid.cellIn(rows, 'Price')`. Given several rows, it gives that column's cell of each, one per row: call
   * `.all()` on the result, not on the rows (an AG Grid row has a pinned and a scrolling part, and only one of them
   * holds the column).
   */
  async cellIn(row: Locator, targetHeader: string): Promise<Locator> {
    return row.locator(await this.cellSelector(targetHeader));
  }

  /** Searches the whole grid for a value: every cell, in any column, that shows `value`. Looks once. */
  async cellWithValue(value: string): Promise<Locator> {
    return this.matchingCells(this.inGrid('row').locator(this.el.selector('cell')), value);
  }

  /** Tells whether column `header` shows `value`, waiting up to the expect timeout for it. */
  async contains(header: string, value: string): Promise<boolean> {
    const cells = this.inGrid('row').locator(await this.cellSelector(header));
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
    const cells = this.inGrid('row').locator(await this.cellSelector(header));
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
    const rows = this.inGrid('row');
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
          ? this.gridRoot.locator(`${this.el.selector('row')}[row-index='${key.slice('index:'.length)}']`)
          : rows.nth(Number(key.slice('position:'.length))),
      )
      .reduce((all, next) => all.or(next));
  }

  /** The cells of `cells` that show `value`, as they are now; a locator matching nothing if there are none. */
  private async matchingCells(cells: Locator, value: string): Promise<Locator> {
    const found = (await this.scan(cells, value)).flatMap((c, i) => (c.matches ? [cells.nth(i)] : []));
    return found.length === 0 ? this.gridRoot.locator(':not(*)') : found.reduce((all, next) => all.or(next));
  }

  /** What each cell of `cells` shows and, if `value` is given, whether it shows it (see {@link scanCells}). */
  private scan(cells: Locator, value?: string): Promise<ScannedCell[]> {
    return cells.evaluateAll(scanCells, {
      rootSelector: this.el.selector('root'),
      rowSelector: this.el.selector('row'),
      want: value ?? null,
    });
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
    const headerCell = this.inGrid('headerCell', { HEADER: header }).first();
    await expect(headerCell, `the column "${header}" of ${this.name()} is shown`).toBeVisible();
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

/**
 * Per window: the column that picks its grid, for windows with several grids. A WeakMap keyed by the window, so a
 * choice ends with the window (each scenario has its own windows) and parallel workers never share one.
 */
const gridColumns = new WeakMap<Page, string>();

/**
 * Makes every GridLibrary created for this window (so `price.grid()` and the grid steps) the grid with this column,
 * the step "I use the grid with column ...". The choice belongs to the window; other windows keep theirs.
 *
 * @param window the window
 * @param column the header text of a column only that grid has; undefined = the window's only grid again
 */
export function useGrid(window: Page, column: string | undefined): void {
  if (column === undefined) gridColumns.delete(window);
  else gridColumns.set(window, column);
}

/** The column picked for a window with {@link useGrid}, or undefined for its only grid. */
export function chosenGridColumn(window: Page): string | undefined {
  return gridColumns.get(window);
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
  /** Its row: "index:<row-index>" for an AG Grid row, else "position:<n>" among the rows of its grid. */
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
  { rootSelector, rowSelector, want }: { rootSelector: string; rowSelector: string; want: string | null },
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
  return cells.map((cell) => {
    const fields = Array.from(
      cell.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select'),
    );
    const row = cell.closest(rowSelector);
    const rowIndex = row?.getAttribute('row-index');
    // positions count within the cell's own grid, as GridLibrary's row lookups do (rows of the grid's root)
    const rowsOf = (c: Element) =>
      Array.from((c.closest(rootSelector) ?? document).querySelectorAll(rowSelector));
    return {
      value: fields.length ? fields.map(shown).join(' ') : (cell.textContent ?? ''),
      matches: want !== null && (same(cell.textContent) || fields.some((f) => same(shown(f)))),
      rowKey: rowIndex != null ? `index:${rowIndex}` : `position:${row ? rowsOf(cell).indexOf(row) : -1}`,
    };
  });
}
