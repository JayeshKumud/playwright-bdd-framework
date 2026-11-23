import { expect, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../config/env';
import { GridLibrary } from './GridLibrary';
import { PageElements } from './PageElements';
import locators from './locators/customers-app.json';
import tableLocators from './locators/grid.customers-table.json';

/**
 * EXAMPLE page object of a single-page frontend that loads its data from the backend (GET/POST /api/customers):
 * mocks/demo-frontend/index.html. The @mock scenario tests it with a mocked backend. For your own frontend, copy
 * this class, point PATH at the real page and delete {@link serveDemo}.
 */
export class CustomersAppPage {
  static readonly PATH = '/demo/customers-app';
  static readonly TITLE = 'Customers App';

  private readonly el: PageElements;

  constructor(readonly page: Page) {
    this.el = new PageElements(page, locators, 'locators/customers-app.json');
  }

  /** Serves the example frontend at PATH from mocks/demo-frontend, because the real app has no such page. */
  async serveDemo(): Promise<this> {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'mocks', 'demo-frontend', 'index.html'), 'utf8');
    await this.page.context().route(new URL(CustomersAppPage.PATH, env.baseUrl).toString(), (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html }),
    );
    return this;
  }

  async open(): Promise<this> {
    await this.page.goto(CustomersAppPage.PATH);
    await expect(this.page).toHaveTitle(CustomersAppPage.TITLE);
    return this;
  }

  grid(): GridLibrary {
    return new GridLibrary(this.page, tableLocators);
  }

  status(): Locator {
    return this.el.get('status');
  }

  async addCustomer(name: string, email: string): Promise<this> {
    await this.el.get('newName').fill(name);
    await this.el.get('newEmail').fill(email);
    await this.el.get('addButton').click();
    return this;
  }
}
