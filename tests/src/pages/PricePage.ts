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

  /** The grid column whose cell holds the TEST1 div (see {@link test1Cells}). */
  static readonly MARKER_HEADER = 'Price';

  /** The grid column that shows a row's unit (see {@link checkboxesWithPriceDiv}). */
  static readonly UNIT_HEADER = 'Unit';

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
   * Selects bookings in the TEST1 dropdown (test1Input): opens it and clicks each option, the li whose p shows
   * that text: `await price.selectBookings('Booking A', 'Booking B')`. The list is left open; close it with
   * {@link closeDropdown}, or use {@link applySearchs}.
   */
  async selectBookings(...bookings: string[]): Promise<this> {
    await this.selectFromDropdown('test1Input', bookings);
    return this;
  }

  /** Selects days in the TEST2 dropdown (test2Input), like {@link selectBookings}. */
  async selectDays(...days: string[]): Promise<this> {
    await this.selectFromDropdown('test2Input', days);
    return this;
  }

  /**
   * Selects bookings and days, closing each list with Escape (the same as agentic-qa-java's applySearchs):
   * `await price.applySearchs(['Booking A'], ['Monday', 'Friday'])`. The bookings list is closed before the days
   * dropdown is opened, so it cannot cover the days input, and the days list is closed at the end.
   */
  async applySearchs(bookings: string[], days: string[]): Promise<this> {
    await this.selectBookings(...bookings);
    await this.closeDropdown();
    await this.selectDays(...days);
    await this.closeDropdown();
    return this;
  }

  /** Closes the open dropdown list with Escape and waits until it is gone. */
  async closeDropdown(): Promise<this> {
    await this.page.keyboard.press('Escape');
    await this.el.get('dropdownList').waitFor({ state: 'hidden' });
    return this;
  }

  /**
   * Opens a dropdown by clicking its input, then clicks each option. Before every option it checks that the list
   * is open, and opens it again if a click closed it (some dropdowns close after each choice).
   */
  private async selectFromDropdown(input: string, options: string[]): Promise<void> {
    await this.el.get(input).click();
    for (const option of options) {
      if (!(await this.el.get('dropdownList').isVisible())) await this.el.get(input).click();
      await this.el.get('dropdownListItem', { OPTION: option }).click(); // waits for the list and the option
    }
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

  /**
   * The cells of column `targetHeader` in the Price grid rows that match `match` and are TEST1 rows. It matches
   * first, then filters: of the rows showing every value of `match`, it keeps those whose Price cell holds a div
   * whose class contains TEST1 (locator test1Marker in locators/price.json):
   * `await price.test1Cells({ Booking: 'Booking A' }, 'Status')`. Fails if no row matches, or none of the matching
   * rows has the TEST1 div.
   */
  async test1Cells(match: RowMatch, targetHeader: string): Promise<Locator[]> {
    const grid = await this.grid().waitUntilLoaded();
    const rows = await grid.rows(match);
    const markerCells = await (await grid.cellIn(rows, PricePage.MARKER_HEADER)).all(); // one per row, same order
    const targetCells = await (await grid.cellIn(rows, targetHeader)).all();
    expect(
      markerCells.length,
      `"${PricePage.MARKER_HEADER}" and "${targetHeader}" cells in the Price grid rows matching ` +
        `${JSON.stringify(match)} (one of each per row)`,
    ).toBe(targetCells.length);
    const test1: Locator[] = [];
    for (let i = 0; i < targetCells.length; i++) {
      if ((await markerCells[i].locator(this.el.selector('test1Marker')).count()) > 0) test1.push(targetCells[i]);
    }
    if (test1.length === 0) {
      throw new Error(
        `None of the ${targetCells.length} Price grid rows matching ${JSON.stringify(match)} has a TEST1 div in ` +
          `its "${PricePage.MARKER_HEADER}" cell`,
      );
    }
    return test1;
  }

  /**
   * The cells of column `header` in the Price grid rows matching `match` whose text contains `text`
   * (case-sensitive), as a list taken now: `await price.cellsContaining({ Booking: 'Booking A' }, 'Range',
   * 'TESTRANGE')`. Fails if no row matches, or none of the matching rows has the text in that column.
   */
  async cellsContaining(match: RowMatch, header: string, text: string): Promise<Locator[]> {
    const grid = await this.grid().waitUntilLoaded();
    const cells: Locator[] = [];
    for (const cell of await (await grid.cellIn(await grid.rows(match), header)).all()) {
      if ((await cell.innerText()).includes(text)) cells.push(cell);
    }
    if (cells.length === 0) {
      throw new Error(`No Price grid row matching ${JSON.stringify(match)} has "${text}" in its "${header}" cell`);
    }
    return cells;
  }

  /**
   * The same cells as {@link cellsContaining}, as one filtered Locator instead of a list:
   * `await price.cellContaining({ Booking: 'Booking A' }, 'Range', 'TESTRANGE')`. The filter runs in the browser on
   * every use, so the Locator follows the grid after a refresh. The text is matched the same way: contained
   * anywhere in the cell, case-sensitive, taken literally.
   *
   * It may find several cells: use `first()`, `nth(i)` or `all()` for actions such as click() or innerText(),
   * which fail on a Locator that finds more than one element.
   */
  async cellContaining(match: RowMatch, header: string, text: string): Promise<Locator> {
    const grid = await this.grid().waitUntilLoaded();
    const cell = (await grid.cellIn(await grid.rows(match), header)).filter({ hasText: literally(text) });
    if ((await cell.all()).length === 0) {
      throw new Error(`No Price grid row matching ${JSON.stringify(match)} has "${text}" in its "${header}" cell`);
    }
    return cell;
  }

  /**
   * The elements a CSS selector finds inside the `header` cells of the Price grid rows matching `match`, at any
   * depth in the cell (the same as agentic-qa-java's elementsInCell):
   *
   *   await (await price.elementsInCell({ Booking: 'Booking A' }, 'Price', 'span.something')).first().click();
   *   await price.elementsInCell(match, 'Price', "span.something:text-is('TEST')");   // class and exact text
   *   await price.elementsInCell(match, 'Price', "span.something:has-text('TEST')");  // text contains, any case
   *   await price.elementsInCell(match, 'Price', "span[class*='price']");             // class contains "price"
   *   await price.elementsInCell(match, 'Status', "span[title='Locked']");            // any attribute
   *
   * The Locator is searched again on every use; it may find several elements (one or more per row), so use
   * first(), nth(i) or all() to act on one.
   *
   * @param match    column header text to the value that column must show
   * @param header   the column whose cells hold the element, for example "Price"
   * @param selector a CSS (or Playwright) selector, for example "span.something"
   * @throws Error if no row matches, or no matching row has such an element in that cell
   */
  async elementsInCell(match: RowMatch, header: string, selector: string): Promise<Locator> {
    const grid = await this.grid().waitUntilLoaded();
    const elements = (await grid.cells(match, header)).locator(selector);
    if ((await elements.all()).length === 0) {
      throw new Error(`No Price grid row matching ${JSON.stringify(match)} has "${selector}" in its "${header}" cell`);
    }
    return elements;
  }

  /**
   * The Price grid rows matching `match` whose Price cell holds a div whose class contains `classPart`
   * (case-sensitive): `await (await price.rowsWithPriceDiv({ Booking: 'Booking A' }, 'TEST1')).all()`. Fails if
   * there are none.
   *
   * The Locator keeps, of each row, the part that holds the Price cell: on an AG Grid with a pinned column, a cell
   * of a column in the other part is not inside it. It is searched again on every use.
   */
  async rowsWithPriceDiv(match: RowMatch, classPart: string): Promise<Locator> {
    const rows = await this.priceDivRows(await this.grid().waitUntilLoaded(), match, classPart);
    expect(
      (await rows.all()).length,
      `a Price grid row matching ${JSON.stringify(match)} with a "${classPart}" div in its Price cell`,
    ).toBeGreaterThan(0);
    return rows;
  }

  /**
   * The checkboxes in column `checkboxHeader` of the Price grid rows of the given units whose Price cell holds a
   * div whose class contains `classPart`: `await price.checkboxesWithPriceDiv(['TEST1', 'TEST2'], 'PRICE1',
   * 'Unique')`. For each unit it filters the rows whose Unit is that unit to those whose Price cell has the div (as
   * {@link rowsWithPriceDiv}), then takes the checkbox in their `checkboxHeader` cell. A unit without such a row is
   * skipped; it fails if no checkbox is found at all.
   *
   * The checkbox column must be in the same part of the row as the Price column: on an AG Grid where one of them is
   * pinned and the other is not, the filtered rows do not contain the checkbox and none is found.
   */
  async checkboxesWithPriceDiv(units: string[], classPart: string, checkboxHeader: string): Promise<Locator[]> {
    const grid = await this.grid().waitUntilLoaded();
    const checkboxes: Locator[] = [];
    for (const unit of units) {
      const rows = await this.priceDivRows(grid, { [PricePage.UNIT_HEADER]: unit }, classPart); // none: skipped
      checkboxes.push(...(await (await grid.cellIn(rows, checkboxHeader)).locator("input[type='checkbox']").all()));
    }
    if (checkboxes.length === 0) {
      throw new Error(
        `No Price grid row of the units ${JSON.stringify(units)} has a "${classPart}" div in its ` +
          `"${PricePage.MARKER_HEADER}" cell and a checkbox in its "${checkboxHeader}" cell (the two columns must ` +
          'be in the same part of the row: not one pinned and the other not)',
      );
    }
    return checkboxes;
  }

  /**
   * The rows matching `match` whose Price cell holds a div whose class contains `classPart`, without failing when
   * there are none (see {@link rowsWithPriceDiv}).
   */
  private async priceDivRows(grid: GridLibrary, match: RowMatch, classPart: string): Promise<Locator> {
    const priceCell = await grid.cellIn(this.page.locator(':scope'), PricePage.MARKER_HEADER); // searched in each row
    return (await grid.rows(match)).filter({ has: priceCell.locator(`div[class*='${classPart}']`) });
  }
}

/** A case-sensitive pattern for text contained anywhere, special characters taken literally. */
function literally(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

/**
 * Tells whether a Splited value is the given value or a range with it on either side: "10->20" has the sides 10 and
 * 20 (numbers by value, so "10.00" counts as 10).
 */
function hasSide(shown: string, side: string): boolean {
  return shown.split(PricePage.RANGE).some((part) => sameValue(part, side));
}
