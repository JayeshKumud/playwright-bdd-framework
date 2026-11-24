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
   * Searches a column for a value: the cells of column `header` whose whole text is `value` (spaces around it
   * ignored).
   */
  cells(header: string, value: string): Promise<Locator>;
  /** The cells of column `targetHeader` in every row that shows all the values of `match`, top to bottom. */
  cells(match: RowMatch, targetHeader: string): Promise<Locator>;
  async cells(a: string | RowMatch, b: string): Promise<Locator> {
    if (typeof a === 'string') {
      return this.el.get('row').locator(await this.cellSelector(a)).filter({ hasText: exactly(b) });
    }
    return (await this.rows(a)).locator(await this.cellSelector(b));
  }

  /** Searches the whole grid for a value: every cell, in any column, whose whole text is `value`. */
  cellWithValue(value: string): Locator {
    return this.el.get('row').locator(this.el.selector('cell')).filter({ hasText: exactly(value) });
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

  /**
   * Every row that shows all the values of `match`, top to bottom: all their parts if the grid splits rows (AG
   * Grid row-index). Waits until at least one row matches, and fails if none does.
   */
  async rows(match: RowMatch): Promise<Locator> {
    return this.matchRows(match);
  }

  /** The trimmed texts of column `targetHeader` in every row that shows all the values of `match`, top to bottom. */
  async values(match: RowMatch, targetHeader: string): Promise<string[]> {
    return (await (await this.cells(match, targetHeader)).allTextContents()).map((t) => t.trim());
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

  /** The texts of a column, top to bottom (the rows the grid has rendered), trimmed. */
  async columnValues(header: string): Promise<string[]> {
    const texts = await this.el.get('row').locator(await this.cellSelector(header)).allTextContents();
    return texts.map((t) => t.trim());
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
 * A pattern for a cell whose whole text is the value, spaces around it ignored. Playwright runs it in the browser,
 * so special characters are escaped.
 */
function exactly(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}
