import { expect, Page } from '@playwright/test';
import { GridLibrary, RowMatch } from './GridLibrary';
import { PageElements } from './PageElements';
import locators from './locators/price.json';

/**
 * Page object of the Price window, a popup opened from the home page's dropdown (the same as agentic-qa-java's
 * PricePage). Steps talk to this class and never use selectors: they live in locators/price.json.
 *
 *   const price = new PricePage(await windows.open(() => home.selectDropdownOption('Price Booking'), PricePage.TITLE));
 *   const price = new PricePage(await windows.window(PricePage.TITLE));   // an open Price window, no switch
 *   await (await price.grid().waitUntilLoaded()).values({ Booking: 'Booking A' }, 'Status');
 */
export class PricePage {
  /** The browser page title (the tab) of the Price window: the text of the option that opens it. */
  static readonly TITLE = 'Price Booking';

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
}
