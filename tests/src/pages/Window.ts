import { Page } from '@playwright/test';
import { PricePage } from './PricePage';
import { UniquePage } from './UniquePage';

/**
 * One of the app's windows. Every window except HOME is opened by the dropdown option with its `text`, and that
 * text is also the window's title.
 */
export interface AppWindow {
  /** The dropdown option's text, exactly as shown, which is also the window's title ("Home" for HOME). */
  readonly text: string;
  /** Checks the window is shown and ready (its page object's verifyDisplayed); none = nothing to check. */
  readonly verify?: (page: Page) => Promise<unknown>;
}

/**
 * The app's windows, the same as agentic-qa-java's Window enum. `windows.switchToWindow` takes these:
 *
 *   await windows.switchToWindow(Window.PRICE_BOOKING);     // opens it from the current window's dropdown
 *   await windows.switchToWindow(Window.CUSTOMER_WINDOW);   // from the Price Booking window's dropdown
 *   await windows.switchToWindow(Window.UNIQUE_WINDOW);     // from Price Booking; replaces it in the same window
 *   await windows.switchToWindow(Window.HOME);              // the scenario's first window
 *
 * Adding a window: add an entry with its exact option text and, if it has one, its page object's check.
 */
export const Window = {
  /** The scenario's first window. Not a dropdown option; it is never opened, only switched to. */
  HOME: { text: 'Home' },
  /** The Price Booking window: option "Price Booking" of the home page's dropdown. */
  PRICE_BOOKING: { text: PricePage.TITLE, verify: (page: Page) => new PricePage(page).verifyDisplayed() },
  /** The Customer window: option "Customer Window" of the Price Booking window's dropdown. */
  CUSTOMER_WINDOW: { text: 'Customer Window' },
  /**
   * The Unique window: option "Unique Window" of the Price Booking window's dropdown. The app loads it into the
   * Price Booking window itself, so that window shows Unique afterwards.
   */
  UNIQUE_WINDOW: { text: UniquePage.TITLE, verify: (page: Page) => new UniquePage(page).verifyDisplayed() },
} as const satisfies Record<string, AppWindow>;

/** All windows, in the order above. */
export const allWindows: readonly AppWindow[] = Object.values(Window);

/**
 * The window with this exact text, for steps that get it from a feature file: `windowOf('Price Booking')`.
 *
 * @throws Error if no window has that text (the message lists the known ones)
 */
export function windowOf(text: string): AppWindow {
  const found = allWindows.find((w) => w.text === text);
  if (!found) {
    const known = JSON.stringify(allWindows.map((w) => w.text));
    throw new Error(`No window "${text}". Known: ${known}. Add it to Window in src/pages/Window.ts.`);
  }
  return found;
}
