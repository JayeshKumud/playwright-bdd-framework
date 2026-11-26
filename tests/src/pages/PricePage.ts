import { expect, Locator, Page } from '@playwright/test';
import { GridLibrary, RowMatch, sameValue } from './GridLibrary';
import { PageElements } from './PageElements';
import locators from './locators/price.json';

/**
 * Page object of the Price window, a popup opened from the home page's dropdown (the same as agentic-qa-java's
 * PricePage). Steps talk to this class and never use selectors: they live in locators/price.json.
 *
 *   const price = new PricePage(await windows.open(() => home.selectDropdownOption('Price Booking'), PricePage.TITLE));
 *   const price = new PricePage(await windows.window(PricePage.TITLE));   // an open Price window, no switch
 *   await (await price.grid().waitUntilLoaded()).values({ Booking: 'Booking A' }, 'Status');
 *
 * The grid's cells of a column in rows you already have, with GridLibrary.cellIn: call `.all()` on the cells, not
 * on the rows (an AG Grid row has a pinned and a scrolling part, and only one holds the column):
 *
 *   const grid = await price.grid().waitUntilLoaded();
 *   const rows = await grid.rows({ Booking: 'Booking A' });
 *   for (const cell of await (await grid.cellIn(rows, 'Price')).all()) {   // one Price cell per matching row
 *     await expect(cell).toBeVisible();
 *   }
 *   const bookings = await (await grid.cellIn(rows, 'Booking')).all();      // same rows, same order
 */
export class PricePage {
  /** The browser page title (the tab) of the Price window: the text of the option that opens it. */
  static readonly TITLE = 'Price Booking';

  /** The grid column that shows ranges such as "10->20" (see {@link verifySelectionShown}). */
  static readonly SPLIT_HEADER = 'Splited';

  /** What separates the two sides of a Splited range, as in "10->20". */
  static readonly RANGE = '->';

  private readonly el: PageElements;

  constructor(readonly page: Page) {
    this.el = new PageElements(page, locators, 'locators/price.json');
  }

  /** Checks that the Price window is shown and ready: its title and its Search Data button. */
  async verifyDisplayed(): Promise<this> {
    await expect(this.page).toHaveTitle(PricePage.TITLE);
    await expect(this.el.get('searchDataButton'), 'the Search Data button of the Price window').toBeVisible();
    return this;
  }

  /** The Price window's data grid (AG Grid). */
  grid(): GridLibrary {
    return new GridLibrary(this.page);
  }

  /** Clicks the filter button. */
  async openFilter(): Promise<this> {
    await this.el.get('filterButton').click();
    return this;
  }

  /**
   * Waits for the grid, then ticks the checkbox in column `checkboxHeader` of every row that shows all the values
   * of `match`: `await price.checkGridRow({ Booking: 'Booking A' }, 'Select')`.
   */
  async checkGridRow(match: RowMatch, checkboxHeader: string): Promise<this> {
    const grid = await this.grid().waitUntilLoaded();
    const checkboxes = await (await grid.elements(match, 'checkbox', checkboxHeader)).all();
    expect(checkboxes.length, `a "${checkboxHeader}" checkbox in the Price grid rows`).toBeGreaterThan(0);
    for (const checkbox of checkboxes) await checkbox.check();
    return this;
  }

  /**
   * Checks that the cell of column `targetHeader` in every Price grid row matching `match` holds the div of a
   * selection: for TEST1 the cell's div whose class contains model1, for TEST2 the one whose class contains model2
   * (locators test1Div and test2Div in locators/price.json):
   * `await price.verifySelectionShown({ Booking: 'Booking A', Splited: '10' }, 'TEST1', 'Price')`.
   *
   * The Splited column shows ranges such as "10->20": a single value ("10" or "20") matches a row if either side is
   * that value, and a range ("10->20") matches only that range. Without a Splited value the rows match as usual.
   */
  async verifySelectionShown(match: RowMatch, selection: string, targetHeader: string): Promise<this> {
    const divLocator = { TEST1: 'test1Div', TEST2: 'test2Div' }[selection.trim().toUpperCase()];
    if (!divLocator) throw new Error(`Selection must be TEST1 or TEST2, not "${selection}"`);
    const grid = await this.grid().waitUntilLoaded();
    const split = match[PricePage.SPLIT_HEADER];
    const cells: Locator[] = [];
    if (split === undefined || split.includes(PricePage.RANGE)) {
      // no Splited value, or a whole range ("10->20"): the usual match
      cells.push(...(await (await grid.cells(match, targetHeader)).all()));
    } else {
      // one side ("10"): every Splited range shown, in the rows the other columns match, with that side
      const { [PricePage.SPLIT_HEADER]: _, ...others } = match;
      const shown =
        Object.keys(others).length === 0
          ? await grid.columnValues(PricePage.SPLIT_HEADER)
          : await grid.values(others, PricePage.SPLIT_HEADER);
      const ranges = [...new Set(shown)].filter((range) => hasSide(range, split));
      if (ranges.length === 0) {
        throw new Error(
          `No Price grid row whose "${PricePage.SPLIT_HEADER}" range has the side "${split}", among the rows ` +
            `matching ${JSON.stringify(match)} (shown: ${JSON.stringify(shown)})`,
        );
      }
      for (const range of ranges) {
        const exact = { ...others, [PricePage.SPLIT_HEADER]: range };
        cells.push(...(await (await grid.cells(exact, targetHeader)).all()));
      }
    }
    expect(cells.length, `a "${targetHeader}" cell in the Price grid rows matching ${JSON.stringify(match)}`).toBeGreaterThan(0);
    for (const cell of cells) {
      await expect(
        cell.locator(this.el.selector(divLocator)),
        `the ${selection} div in the "${targetHeader}" cell of the Price grid rows matching ${JSON.stringify(match)}`,
      ).toBeVisible();
    }
    return this;
  }
}

/**
 * Tells whether a Splited value is the given value or a range with it on either side: "10->20" has the sides 10 and
 * 20 (numbers by value, so "10.00" counts as 10).
 */
function hasSide(shown: string, side: string): boolean {
  return shown.split(PricePage.RANGE).some((part) => sameValue(part, side));
}
