import { BrowserContext, Request, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** One mocked backend endpoint. `url` is a glob ("**\/api/customers") or a path ("/api/customers"). */
export type MockedEndpoint = {
  method?: string;
  url: string;
  status?: number;
  /** Response body as JSON; or use `body` for text. */
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
  /** Wait before answering, to test loading spinners and timeouts. */
  delayMs?: number;
};

/** A call the frontend made to a mocked endpoint, for checks such as "the frontend sent the new customer". */
export type RecordedCall = { method: string; url: string; body?: unknown };

/** Folder of the mock files: tests/mocks/backend/<name>.json, each a list of {@link MockedEndpoint}. */
export const MOCKS_DIR = path.join(__dirname, '..', '..', 'mocks', 'backend');

/**
 * Answers the frontend's backend calls with mock responses, so a frontend can be tested before its backend
 * exists, or with backend states that are hard to create (errors, empty lists, slow answers). It routes the whole
 * browser context, so popups opened by the scenario are mocked too. API steps are not affected: they call the
 * real backend through `context.request`, which routing does not intercept.
 *
 *   await backendMock.useFile('customers-list');                         // mocks/backend/customers-list.json
 *   await backendMock.mock({ method: 'GET', url: '/api/customers', status: 500, json: { detail: 'down' } });
 *   await backendMock.blockUnmocked('/api/**');                          // fail fast on calls nobody mocked
 *   backendMock.calls('POST', '/api/customers');                         // what the frontend sent
 *
 * The last mock added for a URL wins, so a scenario can override one endpoint of a mock file.
 */
export class BackendMock {
  private readonly recorded: RecordedCall[] = [];
  private readonly unmocked: string[] = [];

  constructor(
    private readonly context: BrowserContext,
    private readonly baseUrl: string,
  ) {}

  /** Adds the endpoints of a mock file (tests/mocks/backend/<name>.json). */
  async useFile(name: string): Promise<void> {
    const file = path.join(MOCKS_DIR, name.endsWith('.json') ? name : `${name}.json`);
    if (!fs.existsSync(file)) throw new Error(`Mock file not found: ${file}`);
    const endpoints = JSON.parse(fs.readFileSync(file, 'utf8')) as MockedEndpoint[];
    for (const endpoint of endpoints) await this.mock(endpoint);
  }

  /** Adds one mocked endpoint. */
  async mock(endpoint: MockedEndpoint): Promise<void> {
    const method = endpoint.method?.toUpperCase();
    await this.context.route(this.pattern(endpoint.url), async (route: Route, request: Request) => {
      if (method && request.method() !== method) return route.fallback();
      this.record(request);
      if (endpoint.delayMs) await new Promise((r) => setTimeout(r, endpoint.delayMs));
      await route.fulfill({
        status: endpoint.status ?? 200,
        headers: endpoint.headers,
        ...(endpoint.json !== undefined ? { json: endpoint.json } : { body: endpoint.body ?? '' }),
      });
    });
  }

  /**
   * Fails every call to `url` that no mock answers (status 501 and a clear message), so a missing mock shows up
   * at once instead of as a timeout against a backend that does not exist. Add it before the mocks: Playwright
   * tries the routes added last first.
   */
  async blockUnmocked(url: string): Promise<void> {
    await this.context.route(this.pattern(url), async (route: Route, request: Request) => {
      this.unmocked.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 501, json: { detail: `Not mocked: ${request.method()} ${request.url()}` } });
    });
  }

  /** The calls the frontend made to mocked endpoints, optionally only one method and path. */
  calls(method?: string, url?: string): RecordedCall[] {
    return this.recorded.filter(
      (c) => (!method || c.method === method.toUpperCase()) && (!url || new URL(c.url).pathname === url),
    );
  }

  /** The calls that reached {@link blockUnmocked} because no mock answered them. */
  unmockedCalls(): string[] {
    return [...this.unmocked];
  }

  private record(request: Request): void {
    let body: unknown;
    const raw = request.postData();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    this.recorded.push({ method: request.method(), url: request.url(), body });
  }

  /** A path is made absolute against the base URL; globs and full URLs are used as they are. */
  private pattern(url: string): string {
    return url.startsWith('/') && !url.startsWith('/**') ? new URL(url, this.baseUrl).toString() : url;
  }
}
