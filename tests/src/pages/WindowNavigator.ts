import { expect, Page } from '@playwright/test';

/**
 * Which window a scenario is on. It has no browser of its own, so hooks can ask for it without starting one:
 * `current` stays undefined in API- and MQ-only scenarios.
 */
export class UiState {
  current?: Page;
}

/**
 * Moves a scenario between the app's windows (popups). Steps and the screenshot hooks act on `current`: the first
 * window, or the window the last switch went to.
 *
 *   const price = await windows.open(() => home.selectDropdownOption('Price Booking'), 'Price Booking');
 *   new PricePage(price) ...
 *   await windows.switchTo('Customer Window');   // an open window, by its title
 *   await windows.backToFirst();
 */
export class WindowNavigator {
  private readonly windows = new Map<string, Page>();

  /**
   * @param first the scenario's first window (Playwright's page fixture)
   * @param ui    the scenario's window state, updated on every switch
   */
  constructor(
    readonly first: Page,
    private readonly ui: UiState,
  ) {
    ui.current = first;
  }

  /** @return the window the scenario is on */
  get current(): Page {
    return this.ui.current ?? this.first;
  }

  /**
   * Runs the action that opens a new window, waits for it to load, checks its title when one is given and makes
   * it the current window.
   *
   * @param openAction what opens the window, for example a click
   * @param title      the new window's expected page title; it is also its name for switchTo
   * @return the new window
   */
  async open(openAction: () => Promise<unknown>, title?: string): Promise<Page> {
    const [popup] = await Promise.all([this.current.context().waitForEvent('page'), openAction()]);
    await popup.waitForLoadState();
    if (title !== undefined) {
      await expect(popup, `the new window is "${title}"`).toHaveTitle(title);
      this.windows.set(title, popup);
    }
    return this.makeCurrent(popup);
  }

  /** Switches to an open window by its page title. */
  async switchTo(title: string): Promise<Page> {
    return this.makeCurrent(await this.window(title));
  }

  /**
   * An open window by its page title, without switching to it: for a page object that always works on one window,
   * such as `new PricePage(await windows.window(PricePage.TITLE))`.
   */
  async window(title: string): Promise<Page> {
    const known = this.windows.get(title);
    return known && !known.isClosed() ? known : findByTitle(this.current.context().pages(), title);
  }

  /** Switches back to the first window. */
  async backToFirst(): Promise<Page> {
    return this.makeCurrent(this.first);
  }

  private async makeCurrent(page: Page): Promise<Page> {
    await page.bringToFront();
    this.ui.current = page;
    return page;
  }
}

async function findByTitle(pages: Page[], title: string): Promise<Page> {
  for (const page of pages) {
    if (!page.isClosed() && (await page.title()) === title) return page;
  }
  throw new Error(`No open window has the title "${title}"`);
}
