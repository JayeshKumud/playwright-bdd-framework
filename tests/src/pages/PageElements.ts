import { Locator, Page } from '@playwright/test';

/** One entry of a locator file: a selector, or a selector with a description. */
export type LocatorDefinition = string | { selector: string; description?: string };

/** A locator file: element name -> definition. Keys starting with "_" are comments and ignored. */
export type LocatorFile = Record<string, LocatorDefinition>;

/**
 * The elements of one page object, looked up by name in its locator file (src/pages/locators/<page>.json), so
 * selectors live in one place and never in steps:
 *
 *   private readonly el = new PageElements(page, locators);
 *   await this.el.get('searchInput').fill(name);
 *   await this.el.get('row', { NAME: name }).click();   // "tr:has(td:text-is('NAME'))" with NAME replaced
 *
 * A selector can hold placeholders in upper case; get() replaces each with the given value.
 */
export class PageElements {
  constructor(
    readonly page: Page,
    private readonly locators: LocatorFile,
    private readonly fileName = 'locator file',
  ) {}

  /**
   * @param name   the element's name in the locator file
   * @param params placeholder values, for example { OPTION: 'Price Booking' }
   * @throws Error if the file has no such element
   */
  get(name: string, params: Record<string, string> = {}): Locator {
    return this.page.locator(this.selector(name, params));
  }

  /** The selector of an element, placeholders replaced. */
  selector(name: string, params: Record<string, string> = {}): string {
    const definition = this.locators[name];
    if (definition === undefined || name.startsWith('_')) {
      throw new Error(`"${name}" is not in the ${this.fileName}; add it there`);
    }
    let selector = typeof definition === 'string' ? definition : definition.selector;
    for (const [placeholder, value] of Object.entries(params)) {
      selector = selector.split(placeholder).join(value.replace(/'/g, "\\'"));
    }
    return selector;
  }

  /** The description of an element, for readable failure messages. */
  describe(name: string): string {
    const definition = this.locators[name];
    return typeof definition === 'object' && definition.description ? definition.description : name;
  }
}
