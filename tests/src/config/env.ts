import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Test settings, read once per process from env/<TEST_ENV>.env (dev by default). Precedence, highest first:
 * a real environment variable, env/local.env (personal overrides, not committed), env/<TEST_ENV>.env.
 *
 *   TEST_ENV=ci npx playwright test          (bash)
 *   $env:TEST_ENV='ci'; npx playwright test  (PowerShell)
 */
const envName = process.env.TEST_ENV ?? 'dev';
const envDir = path.join(__dirname, '..', '..', 'env');

// dotenv never overwrites a variable that is already set, so load the highest priority file first.
dotenv.config({ path: path.join(envDir, 'local.env'), quiet: true });
dotenv.config({ path: path.join(envDir, `${envName}.env`), quiet: true });

function text(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Setting ${key} is missing: add it to env/${envName}.env or set it as an environment variable`);
  }
  return value;
}

function int(key: string, fallback: number): number {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value)) throw new Error(`Setting ${key} must be a whole number, got "${process.env[key]}"`);
  return value;
}

function bool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  return value === undefined ? fallback : value.toLowerCase() === 'true';
}

/** The settings of this run. */
export const env = {
  name: envName,
  baseUrl: text('BASE_URL'),
  headless: bool('HEADLESS', true),
  viewport: { width: int('VIEWPORT_WIDTH', 1440), height: int('VIEWPORT_HEIGHT', 900) },
  actionTimeoutMs: int('ACTION_TIMEOUT_MS', 10_000),
  navigationTimeoutMs: int('NAVIGATION_TIMEOUT_MS', 30_000),
  expectTimeoutMs: int('EXPECT_TIMEOUT_MS', 10_000),
  testTimeoutMs: int('TEST_TIMEOUT_MS', 120_000),
  workers: int('WORKERS', 4),
  retries: int('RETRIES', 0),
  /** Attach a screenshot of the current window after every GUI step (a full-page one is always taken on failure). */
  screenshotEveryStep: bool('SCREENSHOT_EVERY_STEP', true),
  mq: {
    host: text('MQ_HOST', 'localhost'),
    port: int('MQ_PORT', 5672),
    username: text('MQ_USERNAME', 'admin'),
    password: text('MQ_PASSWORD', 'admin'),
    receiveTimeoutMs: int('MQ_RECEIVE_TIMEOUT_MS', 10_000),
    /** Address prefixes that tell the broker queue or topic (ActiveMQ Classic: "" and "topic://"). */
    queuePrefix: process.env.MQ_QUEUE_PREFIX ?? '',
    topicPrefix: process.env.MQ_TOPIC_PREFIX ?? 'topic://',
  },
} as const;

export type Env = typeof env;
