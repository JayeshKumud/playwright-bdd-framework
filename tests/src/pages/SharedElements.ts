import { Locator, Page } from '@playwright/test';
import { PageElements } from './PageElements';
import locators from './locators/common.json';

/**
 * Elements and actions that are the same on every window, from locators/common.json (the same as agentic-qa-java's
 * SharedElements and the shared actions of PageComponents):
 *
 *   await new SharedElements(windows.current).selectDropdownOption('Price Booking');
 */
export class SharedElements {
  private readonly el: PageElements;

  /** @param page the window to search */
  constructor(readonly page: Page) {
    this.el = new PageElements(page, locators, 'locators/common.json');
  }

  /** The window's dropdown button. Every window has one, found by its data-testid, whatever its text. */
  dropdownButton(): Locator {
    return this.el.get('dropdownButton');
  }

  /** An option of the open dropdown, by its text, exactly as shown. */
  dropdownOption(option: string): Locator {
    return this.el.get('dropdownOption', { OPTION: option });
  }

  /**
   * Opens this window's dropdown and picks one of its options. The click on the option waits up to 5 s for the
   * list; if the list closed again before the option was clicked, the button is clicked once more and the option
   * again.
   *
   * @param option the option's text, exactly as shown, for example Window.PRICE_BOOKING.text
   */
  async selectDropdownOption(option: string): Promise<void> {
    try {
      await this.dropdownButton().click();
      await this.dropdownOption(option).click({ timeout: 5_000 });
    } catch {
      await this.dropdownButton().click();
      await this.dropdownOption(option).click();
    }
  }
}
