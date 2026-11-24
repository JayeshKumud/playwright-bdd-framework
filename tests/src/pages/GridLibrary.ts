import { expect, Locator, Page } from '@playwright/test';
import { LocatorFile, PageElements } from './PageElements';
import agGridLocators from './locators/grid.ag-grid.json';

/** The element types {@link GridLibrary.elements} knows; anything else is used as a CSS selector. */
export const ELEMENT_TYPES = ['checkbox', 'radio', 'button', 'link', 'input', 'dropdown', 'image'] as const;

/** A column: its header text, or its 1-based position as shown on screen. */
export type Column = string | number;

/**
 * The values a row must show, as { header: value }: `{ Name: 'COE', Role: 'Admin' }` is the row whose Name is
 * "COE" and whose Role is "Admin". Every function that takes a row as (header, value) also takes one of these.
 */
export type RowMatch = Record<string, string>;

/**
 * A data grid, with the same functions for every page. Columns are named by their header text (or position), so
 * tests never deal with column ids:
 *
 *   const grid = await customersPage.grid().waitUntilLoaded();
 *   await grid.cells('Name', 'Ada Lovelace');                       // the Name cells showing "Ada Lovelace"
 *   await grid.cells('Name', 'Ada Lovelace', 'Status');             // the Status cells of those rows
 *   await grid.cells({ Name: 'COE', Role: 'Admin' }, 'Status');     // the Status cells of the rows matching both
 *   await grid.cellValues({ Role: 'Admin' }, 'Name');               // the Name of every Admin row
 *   await grid.rows({ Role: 'Admin' });                             // every Admin row
 *   await (await grid.checkboxes('Booking', 'Booking A')).check();  // the checkbox of the Booking A row
 *   await grid.elements({ Role: 'Admin' }, 'button', 'Actions');    // the Actions buttons of every Admin row
 *   await grid.elements('Booking', 'Booking A', 'link', 3);         // the links in those rows' 3rd column
 *   await grid.columnValues('Name');                                // all names shown
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
   * The rows whose column `header` shows `value`, or that show every value of `match`, top to bottom: all their
   * parts if the grid splits rows (AG Grid row-index). Waits until at least one row matches. All the functions
   * below work on every matching row: add `.first()` or `.nth(i)` to the result for one of them.
   */
  rows(header: string, value: string): Promise<Locator>;
  rows(match: RowMatch): Promise<Locator>;
  async rows(a: string | RowMatch, b?: string): Promise<Locator> {
    return this.matchRows(toMatch(a, b));
  }

  /**
   * The `target` cells of every row whose column `header` shows `value`, or that matches `match`, top to bottom.
   * Without `target`: the cells of column `header` whose whole text is `value` (spaces around it ignored).
   */
  cells(header: string, value: string, target?: Column): Promise<Locator>;
  cells(match: RowMatch, target: Column): Promise<Locator>;
  async cells(a: string | RowMatch, b: string | Column, c?: Column): Promise<Locator> {
    if (typeof a === 'string' && c === undefined) {
      return this.el.get('row').locator(await this.cellSelector(a)).filter({ hasText: exactly(String(b)) });
    }
    const [match, target] = typeof a === 'string' ? [toMatch(a, String(b)), c!] : [a, b];
    return (await this.rows(match)).locator(await this.cellSelector(target));
  }

  /** The trimmed texts of the `target` cells of every matching row, top to bottom. */
  cellValues(header: string, value: string, target: Column): Promise<string[]>;
  cellValues(match: RowMatch, target: Column): Promise<string[]>;
  async cellValues(a: string | RowMatch, b: string | Column, c?: Column): Promise<string[]> {
    const cells = typeof a === 'string' ? await this.cells(a, String(b), c!) : await this.cells(a, b);
    return (await cells.allTextContents()).map((t) => t.trim());
  }

  /** Tells whether column `header` shows `value`, waiting up to the action timeout for it. */
  async contains(header: string, value: string): Promise<boolean> {
    try {
      await (await this.cells(header, value)).first().waitFor({ state: 'visible' });
      return true;
    } catch {
      return false;
    }
  }

  /** The texts of a column, top to bottom (the rows the grid has rendered), trimmed. */
  async columnValues(header: string): Promise<string[]> {
    const texts = await this.el.get('row').locator(await this.cellSelector(header)).allTextContents();
    return texts.map((t) => t.trim());
  }

  /** The checkboxes of every matching row: anywhere in them, or in a given column (header text or position). */
  checkboxes(header: string, value: string, column?: Column): Promise<Locator>;
  checkboxes(match: RowMatch, column?: Column): Promise<Locator>;
  async checkboxes(a: string | RowMatch, b?: string | Column, c?: Column): Promise<Locator> {
    return typeof a === 'string' ? this.elements(a, String(b), 'checkbox', c) : this.elements(a, 'checkbox', b);
  }

  /**
   * The elements of a type in every row whose column `header` shows `value` (or that matches `match`), anywhere in
   * the rows or in a given column, top to bottom. `elementType` is one of {@link ELEMENT_TYPES} (case ignored) or a
   * CSS selector: a tag ("span"), a class (".ag-icon") or an attribute ("[data-testid='edit']").
   */
  elements(header: string, value: string, elementType: string, column?: Column): Promise<Locator>;
  elements(match: RowMatch, elementType: string, column?: Column): Promise<Locator>;
  async elements(a: string | RowMatch, b: string, c?: string | Column, d?: Column): Promise<Locator> {
    const [match, elementType, column] = typeof a === 'string' ? [toMatch(a, b), String(c), d] : [a, b, c];
    const rows = await this.rows(match);
    const scope = column === undefined ? rows : rows.locator(await this.cellSelector(column));
    return scope.locator(this.elementSelector(elementType));
  }

  /**
   * Finds the rows showing every value of `match`, waiting until there is one. Rows without a row-index (a plain
   * table) must show all the values themselves; AG Grid rows match when their parts sharing a row-index do.
   */
  private async matchRows(match: RowMatch): Promise<Locator> {
    const entries = Object.entries(match);
    if (entries.length === 0) throw new Error('A grid row match needs at least one column and value');
    const rows = this.el.get('row');
    const perColumn: Locator[] = [];
    for (const [header, value] of entries) {
      const hasValue = this.page.locator(await this.cellSelector(header)).filter({ hasText: exactly(value) });
      perColumn.push(rows.filter({ has: hasValue }));
    }
    const together = perColumn.slice(1).reduce((found, next) => found.and(next), perColumn[0]);
    const byIndex = (i: string) => `${this.el.selector('row')}[row-index='${i}']`;
    let found: Locator | undefined;
    await expect
      .poll(
        async () => {
          const indexes = await Promise.all(
            perColumn.map((l) => l.evaluateAll((els) => els.map((e) => e.getAttribute('row-index')))),
          );
          if (indexes.every((list) => list.every((i) => i === null))) {
            if ((await together.count()) === 0) return false;
            found = together;
            return true;
          }
          const common = [...new Set(indexes[0])].filter(
            (i): i is string => i !== null && indexes.every((list) => list.includes(i)),
          );
          if (common.length === 0) return false;
          found = this.page.locator(common.map(byIndex).join(', '));
          return true;
        },
        { message: `a grid row where ${describe(match)} is shown` },
      )
      .toBe(true);
    return found!;
  }

  /** The selector of a column's cells: by col-id or header position for a header text, by position for a number. */
  private async cellSelector(column: Column): Promise<string> {
    const cell = this.el.selector('cell');
    if (typeof column === 'number') {
      const attribute = this.locators.columnIndexAttribute;
      return typeof attribute === 'string' ? `${cell}[${attribute}='${column}']` : `${cell}:nth-child(${column})`;
    }
    return cell + (await this.columnKey(column));
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

/** A row given as (header, value) or as a {@link RowMatch}, as a RowMatch. */
function toMatch(a: string | RowMatch, value?: string): RowMatch {
  return typeof a === 'string' ? { [a]: value ?? '' } : a;
}

/** `"Name" is "COE" and "Role" is "Admin"`, for messages. */
function describe(match: RowMatch): string {
  return Object.entries(match)
    .map(([header, value]) => `"${header}" is "${value}"`)
    .join(' and ');
}

/**
 * A pattern for a cell whose whole text is the value, spaces around it ignored. Playwright runs it in the browser,
 * so special characters are escaped.
 */
function exactly(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}
