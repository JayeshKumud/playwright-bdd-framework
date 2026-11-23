/**
 * Clean-up actions a scenario registers while it creates data (a customer, a queue message, ...). They run after
 * the scenario, newest first, whether it passed or failed. A failing action is reported and the others still run,
 * so clean-up never hides the real test result.
 *
 *   const customer = await customersApi.create(...);
 *   cleanup.add(`delete customer ${customer.id}`, () => customersApi.delete(customer.id));
 */
export class Cleanup {
  private readonly actions: { name: string; run: () => Promise<unknown> }[] = [];

  /**
   * @param name what the action does, shown if it fails
   * @param run  the action
   */
  add(name: string, run: () => Promise<unknown>): void {
    this.actions.push({ name, run });
  }

  /** Runs the actions newest first; returns the failures as "name: message" lines. */
  async runAll(): Promise<string[]> {
    const failures: string[] = [];
    for (const action of this.actions.reverse()) {
      try {
        await action.run();
      } catch (error) {
        failures.push(`${action.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.actions.length = 0;
    return failures;
  }
}
