import { APIResponse } from '@playwright/test';

/** One API call of the scenario, as attached to the report when the scenario fails. */
export type ApiCall = { method: string; url: string; status: number; body: string };

const MAX_BODY = 4000;

/**
 * The API calls of one scenario, oldest first. The `api` fixture attaches them to the report (Allure, HTML) when
 * the scenario fails, so a failed API step shows what was sent back.
 */
export class ApiLog {
  readonly calls: ApiCall[] = [];

  /** Records a response and returns it unchanged. */
  async record(method: string, response: APIResponse): Promise<APIResponse> {
    let body = await response.text().catch(() => '<body not readable>');
    if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY)}... (cut)`;
    this.calls.push({ method, url: response.url(), status: response.status(), body });
    return response;
  }

  /** @return the calls as readable text */
  toString(): string {
    return this.calls.map((c) => `${c.method} ${c.url} -> ${c.status}\n${c.body}`).join('\n\n');
  }
}
