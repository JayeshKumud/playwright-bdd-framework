import { expect, Locator, Page } from '@playwright/test';
import { LocatorFile, PageElements } from './PageElements';
import agGridLocators from './locators/grid.ag-grid.json';

/** The element types {@link GridLibrary.element} knows; anything else is used as a CSS selector. */
export const ELEMENT_TYPES = ['checkbox', 'radio', 'button', 'link', 'input', 'dropdown', 'image'] as const;

/** A column: its header text, or its 1-based position as shown on screen. */
export type Column = string | number;

/**
 * A data grid, with the same functions for every page. Columns are named by their header text (or position), so
 * tests never deal with column ids:
 *
 *   const grid = await customersPage.grid().waitUntilLoaded();
 *   await grid.cell('Name', 'Ada Lovelace');                        // the Name cell showing "Ada Lovelace"
 *   await grid.cell('Name', 'Ada Lovelace', 'Status');              // the Status cell in that row
 *   await (await grid.checkbox('Booking', 'Booking A')).check();    // the checkbox anywhere in that row
 *   await grid.element('Booking', 'Booking A', 'button', 'Actions');// a button in the row's Actions column
 *   await grid.element('Booking', 'Booking A', 'link', 3);          // a link in the row's 3rd column
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
   * The cells of column `header` whose whole text is `value` (spaces around it ignored); with `target`, the cell
   * of that other column in the same row.
   */
  async cell(header: string, value: string, target?: Column): Promise<Locator> {
    if (target !== undefined) return (await this.row(header, value)).locator(await this.cellSelector(target));
    return this.el.get('row').locator(await this.cellSelector(header)).filter({ hasText: exactly(value) });
  }

  /** The row whose column `header` shows `value`: all its parts if the grid splits rows (AG Grid row-index). */
  async row(header: string, value: string): Promise<Locator> {
    const hasValue = this.page.locator(await this.cellSelector(header)).filter({ hasText: exactly(value) });
    const row = this.el.get('row').filter({ has: hasValue }).first();
    await expect(row, `"${value}" is in the grid column "${header}"`).toBeVisible();
    const rowIndex = await row.getAttribute('row-index');
    return rowIndex === null ? row : this.page.locator(`${this.el.selector('row')}[row-index='${rowIndex}']`);
  }

  /** Tells whether column `header` shows `value`, waiting up to the action timeout for it. */
  async contains(header: string, value: string): Promise<boolean> {
    try {
      await (await this.cell(header, value)).first().waitFor({ state: 'visible' });
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

  /** The checkbox of the row: anywhere in it, or in a given column (header text or 1-based position). */
  async checkbox(header: string, value: string, column?: Column): Promise<Locator> {
    return this.element(header, value, 'checkbox', column);
  }

  /**
   * Any element of the row whose column `header` shows `value`, by type, anywhere in the row or in a given column.
   * `elementType` is one of {@link ELEMENT_TYPES} (case ignored) or a CSS selector: a tag ("span"), a class
   * (".ag-icon") or an attribute ("[data-testid='edit']"). The first match is returned.
   */
  async element(header: string, value: string, elementType: string, column?: Column): Promise<Locator> {
    const scope = column === undefined ? await this.row(header, value) : await this.cell(header, value, column);
    return scope.locator(this.elementSelector(elementType)).first();
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

/**
 * A pattern for a cell whose whole text is the value, spaces around it ignored. Playwright runs it in the browser,
 * so special characters are escaped.
 */
function exactly(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}
