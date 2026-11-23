/**
 * A typed key for {@link ScenarioData}: the type of the value travels with the key, so reads need no casts.
 *
 *   export const CUSTOMER = DataKey.of<Customer>('customer');
 *   data.put(CUSTOMER, customer);       // in one step
 *   const customer = data.get(CUSTOMER); // in a later step: typed as Customer
 */
export class DataKey<T> {
  private constructor(readonly name: string) {}

  /** @param name the key's name, shown in error messages */
  static of<T>(name: string): DataKey<T> {
    return new DataKey<T>(name);
  }

  /** Never called: only keeps T part of the type, so DataKey<A> and DataKey<B> are different types. */
  protected phantom?: T;
}

/**
 * The data the steps of one scenario share (GUI, API and MQ steps alike). One instance per scenario, created by
 * the `data` fixture, so parallel scenarios never see each other's data.
 */
export class ScenarioData {
  private readonly values = new Map<DataKey<unknown>, unknown>();

  put<T>(key: DataKey<T>, value: T): T {
    this.values.set(key, value);
    return value;
  }

  /** @throws Error naming the key if no step has put a value under it yet */
  get<T>(key: DataKey<T>): T {
    if (!this.values.has(key)) {
      throw new Error(`No "${key.name}" in this scenario yet: an earlier step has to create or store it`);
    }
    return this.values.get(key) as T;
  }

  find<T>(key: DataKey<T>): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  has(key: DataKey<unknown>): boolean {
    return this.values.has(key);
  }

  /** Adds a value to the list under the key (created on first use) and returns the list. */
  add<T>(key: DataKey<T[]>, value: T): T[] {
    const list = (this.values.get(key) as T[] | undefined) ?? [];
    list.push(value);
    this.values.set(key, list);
    return list;
  }
}
