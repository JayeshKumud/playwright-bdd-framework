import { expect, Page } from '@playwright/test';
import { env } from '../config/env';

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
 *   await windows.open(() => openUniqueFromPrice(), UniquePage.TITLE, () => pricePage.verifyDisplayed());
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
   * Runs the action that opens a window, finds that window, waits for it to load, checks its title when one is
   * given and makes it the current window. The same as agentic-qa-java's WindowNavigator.openWindow: it does not
   * rely on the current window being the new window's opener, because apps open windows in three ways:
   *
   * 1. the current window opens it, or another window does (for example the home window opens every window): a
   *    new page appears in the browser context, whichever window opened it;
   * 2. the app reuses a window that is already open (`window.open(url, name)`), or loads the new page into the
   *    current window itself (Price Booking becomes Unique Window in the same browser window): no new page
   *    appears, so the window is found by `title` (needed for this case). A window that now shows another page
   *    is forgotten under its old title;
   * 3. the action runs before the current window is ready, or the app opens the window only after a slow call:
   *    pass `ready` (for example `() => price.verifyDisplayed()`), and the wait lasts up to NAVIGATION_TIMEOUT_MS.
   *
   *   await windows.open(() => openUniqueFromPrice(), UniquePage.TITLE, () => price.verifyDisplayed());
   *
   * @param openAction what opens the window, for example a click
   * @param title      the window's expected page title; it is also its name for switchTo
   * @param ready      checks the current window is ready before the action runs
   * @return the window that opened
   * @throws Error if no window shows up in time; the message lists the open windows
   */
  async open(openAction: () => Promise<unknown>, title?: string, ready?: () => Promise<unknown>): Promise<Page> {
    if (ready) await ready();
    const source = this.current;
    const before = new Set(source.context().pages());
    const sourceTitle = await titleOf(source);

    await openAction();
    const window = await this.findOpened(source, sourceTitle, before, title);

    await window.waitForLoadState();
    if (title !== undefined) {
      await expect(window, `the new window is "${title}"`).toHaveTitle(title);
      for (const [name, page] of this.windows) {
        if (page === window && name !== title) this.windows.delete(name);   // replaced in place: old page gone
      }
      this.windows.set(title, window);
    }
    return this.makeCurrent(window);
  }

  /**
   * The window the action opened: the first page that was not in the browser context before it, else (with a
   * title) an open window other than `source` with that title, else `source` itself once its title is `title`.
   * Checks every 250 ms, up to NAVIGATION_TIMEOUT_MS.
   */
  private async findOpened(source: Page, sourceTitle: string, before: Set<Page>, title?: string): Promise<Page> {
    const context = source.context();
    const end = Date.now() + env.navigationTimeoutMs;
    for (;;) {
      const added = context.pages().find((page) => !before.has(page));
      if (added) {
        console.log(`[WINDOW] "${title ?? added.url()}" opened a new window from "${sourceTitle}"`);
        return added;
      }
      if (title !== undefined) {
        for (const page of context.pages()) {
          if (page !== source && !page.isClosed() && (await titleOf(page)) === title) {
            console.log(`[WINDOW] "${title}" is an already open window (reused), not a new one`);
            return page;
          }
        }
        if (!source.isClosed() && (await titleOf(source)) === title) {
          console.log(`[WINDOW] "${title}" replaced "${sourceTitle}" in the same window`);
          return source;
        }
      }
      if (Date.now() >= end) {
        const open = await Promise.all(context.pages().map(titleOf));
        throw new Error(
          `Opened "${title ?? 'a window'}" from "${sourceTitle}", but within ${env.navigationTimeoutMs} ms no new ` +
            `window opened${title !== undefined ? ` and no open window has the title "${title}"` : ''}. ` +
            `Open windows: ${JSON.stringify(open)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
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

/** The page's title, or "" while it is loading or closing. */
async function titleOf(page: Page): Promise<string> {
  return page.isClosed() ? '' : page.title().catch(() => '');
}

async function findByTitle(pages: Page[], title: string): Promise<Page> {
  for (const page of pages) {
    if ((await titleOf(page)) === title) return page;
  }
  throw new Error(`No open window has the title "${title}"`);
}
