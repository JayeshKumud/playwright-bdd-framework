import { DataTable } from 'playwright-bdd';
import { PricePage } from '../../pages/PricePage';
import { Window, windowOf } from '../../pages/Window';
import { WindowNavigator } from '../../pages/WindowNavigator';
import { When, Then } from '../../fixtures/test';

// Steps that move between the app's windows (WindowNavigator.switchToWindow), the same as agentic-qa-java's
// WindowSteps. After a switch, the steps of that window act on it. The fixed steps ("I open the Price Booking
// window") pass a Window; "I switch to the ... window" takes the window's text from the feature (windowOf).
//
//   When I open the Price Booking window
//   And I open the filter on the Price window
//   And I apply the search on the Price window
//     | bookings | Booking A | Booking C |
//     | days     | Monday    | Friday    |
//   And I open the Customer window
//   And I go back to the "Price Booking" window
//   Then the Price window is displayed
//   When I open the Unique window
//   And I go back to the "Home" window

When('I switch to the {string} window', async ({ windows }, window: string) => {
  await windows.switchToWindow(windowOf(window));
});

When('I go back to the {string} window', async ({ windows }, window: string) => {
  await windows.switchToWindow(windowOf(window));
});

When('I open the Price Booking window', async ({ windows }) => {
  await windows.switchToWindow(Window.PRICE_BOOKING);
});

// The Customer Window option is in the Price Booking window's dropdown, so open that first.
When('I open the Customer window', async ({ windows }) => {
  await windows.switchToWindow(Window.CUSTOMER_WINDOW);
});

// The Unique Window option is in the Price Booking window's dropdown; the app shows Unique in that same window.
When('I open the Unique window', async ({ windows }) => {
  await windows.switchToWindow(Window.UNIQUE_WINDOW);
});

// Opening the window already checks this; use it after going back to a Price window that may have changed.
Then('the Price window is displayed', async ({ windows }) => {
  await (await price(windows)).verifyDisplayed();
});

When('I open the filter on the Price window', async ({ windows }) => {
  await (await price(windows)).openFilter();
});

// One row per field with its values across; empty cells are skipped and a missing row selects nothing.
When('I apply the search on the Price window', async ({ windows }, table: DataTable) => {
  const rows = new Map(table.raw().map(([field, ...values]) => [field, values.filter((v) => v.trim() !== '')]));
  await (await price(windows)).applySearchs(rows.get('bookings') ?? [], rows.get('days') ?? []);
});

/** The Price window's page object: the open Price window, without switching to it. */
async function price(windows: WindowNavigator): Promise<PricePage> {
  return new PricePage(await windows.window(PricePage.TITLE));
}
