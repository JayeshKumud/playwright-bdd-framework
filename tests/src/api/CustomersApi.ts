import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { ApiLog } from './ApiLog';

/** A customer as the API returns it. */
export type Customer = { id: number; name: string; email: string; status: 'active' | 'inactive' | string };

/** What the API needs to create or update a customer. */
export type CustomerInput = { name: string; email: string; status?: string };

/**
 * The customers API. It uses the scenario's browser context's request object (`context.request`), so API calls
 * share cookies and session with the GUI steps of the same scenario: log in through the GUI, call the API as that
 * user, or the other way round.
 *
 * Methods ending in `Response` return the raw response for steps that check status codes; the others check the
 * status and return the typed body. Every customer created through {@link create} (or passed to {@link track}) is
 * deleted after the scenario by the `customersApi` fixture, while the browser context is still open.
 */
export class CustomersApi {
  static readonly PATH = '/customers';

  private readonly tracked = new Set<number>();

  constructor(
    private readonly request: APIRequestContext,
    private readonly log: ApiLog,
  ) {}

  async list(): Promise<Customer[]> {
    return this.ok(await this.listResponse(), 200);
  }

  async listResponse(): Promise<APIResponse> {
    return this.log.record('GET', await this.request.get(CustomersApi.PATH));
  }

  async get(id: number): Promise<Customer> {
    return this.ok(await this.getResponse(id), 200);
  }

  async getResponse(id: number): Promise<APIResponse> {
    return this.log.record('GET', await this.request.get(`${CustomersApi.PATH}/${id}`));
  }

  async create(input: CustomerInput): Promise<Customer> {
    const customer = await this.ok<Customer>(await this.createResponse(input), 201);
    this.track(customer.id);
    return customer;
  }

  async createResponse(input: CustomerInput): Promise<APIResponse> {
    return this.log.record('POST', await this.request.post(CustomersApi.PATH, { data: input }));
  }

  async update(id: number, input: CustomerInput): Promise<Customer> {
    return this.ok(await this.log.record('PUT', await this.request.put(`${CustomersApi.PATH}/${id}`, { data: input })), 200);
  }

  async deleteResponse(id: number): Promise<APIResponse> {
    return this.log.record('DELETE', await this.request.delete(`${CustomersApi.PATH}/${id}`));
  }

  /** Deletes a customer; a customer that is already gone (404) is fine, for clean-up. */
  async deleteIfExists(id: number): Promise<void> {
    const response = await this.deleteResponse(id);
    expect([204, 404], `DELETE ${CustomersApi.PATH}/${id} status`).toContain(response.status());
  }

  /** Deletes the customer after the scenario, for customers created another way (GUI form, a message ...). */
  track(id: number): void {
    this.tracked.add(id);
  }

  /** Deletes every tracked customer, newest first; returns the failures. Called by the fixture after the scenario. */
  async deleteTracked(): Promise<string[]> {
    const failures: string[] = [];
    for (const id of [...this.tracked].reverse()) {
      try {
        await this.deleteIfExists(id);
      } catch (error) {
        failures.push(`delete customer ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.tracked.clear();
    return failures;
  }

  /** The customers whose name is exactly `name`. */
  async findByName(name: string): Promise<Customer[]> {
    return (await this.list()).filter((c) => c.name === name);
  }

  private async ok<T>(response: APIResponse, status: number): Promise<T> {
    expect(response.status(), `${response.url()} status (body: ${await response.text()})`).toBe(status);
    return (await response.json()) as T;
  }
}
