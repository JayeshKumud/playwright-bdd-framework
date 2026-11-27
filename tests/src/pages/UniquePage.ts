import { expect, Page } from '@playwright/test';
import { PageElements } from './PageElements';
import locators from './locators/unique.json';

/**
 * Page object of the Unique window (the same as agentic-qa-java's UniquePage): opened from the Price window's
 * dropdown, and the app loads it into the Price window itself, so no new browser window appears.
 * WindowNavigator finds it by its title:
 *
 *   const unique = new UniquePage(await windows.switchToWindow(Window.UNIQUE_WINDOW));
 *
 * After that the window no longer shows Price Booking, so `windows.window(PricePage.TITLE)` fails until Price is
 * opened again. Selectors live in locators/unique.json.
 */
export class UniquePage {
  /** The browser page title (the tab) of the Unique window: the text of the option that opens it. */
  static readonly TITLE = 'Unique Window';

  private readonly el: PageElements;

  constructor(readonly page: Page) {
    this.el = new PageElements(page, locators, 'locators/unique.json');
  }

  /** The page's elements by their name in locators/unique.json. */
  elements(): PageElements {
    return this.el;
  }

  /**
   * Checks that the Unique window is shown: its title. Add a check of an element only this window has once it is
   * in unique.json.
   */
  async verifyDisplayed(): Promise<this> {
    await expect(this.page).toHaveTitle(UniquePage.TITLE);
    return this;
  }
}
