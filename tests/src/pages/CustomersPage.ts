import { expect, Locator, Page } from '@playwright/test';
import { GridLibrary } from './GridLibrary';
import { PageElements } from './PageElements';
import locators from './locators/customers.json';
import tableLocators from './locators/grid.customers-table.json';

/**
 * Page object of the customers page. Steps talk to this class and never use selectors: they live in
 * locators/customers.json and are looked up by name.
 */
export class CustomersPage {
  static readonly PATH = '/';
  static readonly TITLE = 'Customer Management';

  private readonly el: PageElements;

  constructor(readonly page: Page) {
    this.el = new PageElements(page, locators, 'locators/customers.json');
  }

  /** Opens the page and checks that it is shown. */
  async open(): Promise<this> {
    await this.page.goto(CustomersPage.PATH);
    return this.verifyDisplayed();
  }

  /** Checks that the page is shown: its title and its search box. */
  async verifyDisplayed(): Promise<this> {
    await expect(this.page).toHaveTitle(CustomersPage.TITLE);
    await expect(this.el.get('searchInput'), 'the search box is shown').toBeVisible();
    return this;
  }

  /** The customers table, with the grid functions (cell, row, columnValues, element ...). */
  grid(): GridLibrary {
    return new GridLibrary(this.page, tableLocators);
  }

  /** Searches by name and waits for the results. */
  async search(name: string): Promise<this> {
    await this.el.get('searchInput').fill(name);
    await Promise.all([this.page.waitForURL(/[?&]q=/), this.el.get('searchButton').click()]);
    return this;
  }

  /** Adds a customer through the form; the page reloads with the list. */
  async addCustomer(name: string, email: string): Promise<this> {
    await this.el.get('newName').fill(name);
    await this.el.get('newEmail').fill(email);
    await Promise.all([this.page.waitForLoadState('load'), this.el.get('addButton').click()]);
    return this;
  }

  /** The "No customers found." message. */
  noResultsMessage(): Locator {
    return this.el.get('noResults');
  }

  /** The "Page x of y" text. */
  pageIndicator(): Locator {
    return this.el.get('pageIndicator');
  }
}
