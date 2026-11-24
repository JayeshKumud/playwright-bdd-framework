# Running tests: environments, tags, parallel runs and retries

All commands run in the `tests/` folder.

## Quick reference

```bash
npm install && npm run browsers:install        # once per machine
npm test                                       # every scenario, dev environment
npm run test:api                               # one tag: test:ui, test:api, test:mq, test:e2e, test:mock, test:smoke
npm test -- --grep "@api" --grep-invert "@smoke"   # any tag combination
npm test -- --grep "Create a customer"         # by scenario name
npm run test:headed                            # visible browser, one worker
npm test -- --workers=8                        # 8 scenarios at a time
npm test -- --retries=2                        # retry failed scenarios up to twice
npx playwright test --last-failed              # only what failed last time (after a bddgen)
npm run typecheck                              # TypeScript check
npm run steps:list                             # every step definition
```

PowerShell sets environment variables differently from bash:

```powershell
$env:TEST_ENV='ci'; npm test
```

```bash
TEST_ENV=ci npm test
```

## What `npm test` does

```
npm test
 ├─ node scripts/clean.js   deletes allure-results/, reports/, test-results/, .features-gen/
 ├─ bddgen                   reads features/**/*.feature and the steps; writes one Playwright test file per
 │                           feature into .features-gen/. Fails if a step has no definition (missingSteps: 'fail-on-gen')
 └─ playwright test          runs the generated tests with playwright.config.ts
```

`npm test -- <args>` passes the arguments to `playwright test`. Running `npx playwright test` alone uses the
generated files from the last `bddgen`, so run `npx bddgen` first after changing features or steps.

## Configuration

Settings come from [src/config/env.ts](../src/config/env.ts), which reads a `.env` file once per process.
Highest priority first:

| Source | Example | Use |
|---|---|---|
| a real environment variable | `BASE_URL=https://uat.example.com npm test` | CI secrets, one-off overrides |
| `env/local.env` | your own `HEADLESS=false` | personal settings, git-ignored |
| `env/<TEST_ENV>.env` | `env/ci.env` | the environment's settings; `TEST_ENV` defaults to `dev` |
| the default in `env.ts` | `WORKERS` → 4 | everything not set above |

| Setting | dev | ci | Used for |
|---|---|---|---|
| `BASE_URL` | `http://127.0.0.1:8000` | same | pages (`page.goto('/')`) and API calls (`/customers`) |
| `HEADLESS` | `true` | `true` | browser visible or not |
| `VIEWPORT_WIDTH` / `_HEIGHT` | 1440 × 900 | same | browser size |
| `ACTION_TIMEOUT_MS` | 10000 | 15000 | click, fill, locator waits |
| `NAVIGATION_TIMEOUT_MS` | 30000 | 45000 | `goto`, load waits |
| `EXPECT_TIMEOUT_MS` | 10000 | 15000 | `expect(locator).toHaveText(...)` and other web assertions |
| `TEST_TIMEOUT_MS` | 120000 | 180000 | a whole scenario, including its hooks and fixtures |
| `WORKERS` | 4 | 2 | scenarios at a time |
| `RETRIES` | 0 | 1 | retries of a failed scenario |
| `SCREENSHOT_EVERY_STEP` | `true` | `true` | screenshot after each GUI step |
| `MQ_*` | local broker | local broker | see [messaging.md](messaging.md#broker-settings) |

A required setting that is missing fails at start-up with
`Setting BASE_URL is missing: add it to env/dev.env or set it as an environment variable`. A number that is not
a whole number fails the same way.

### Reading settings in code

```ts
import { env } from '../config/env';

env.baseUrl;            // typed: string
env.mq.receiveTimeoutMs; // typed: number
```

`env` is the Java framework's `Settings`, and `env/<name>.env` its `config/env/<name>.properties`. There is no
`common.properties`: every env file lists all keys, and `env.ts` holds the defaults.

### Adding an environment

1. Copy `env/ci.env` to `env/uat.env` and change what differs (`BASE_URL`, timeouts, `RETRIES`).
2. Run with `TEST_ENV=uat npm test`.
3. Keep passwords out of the file: set them as environment variables (CI secrets).

### Adding a setting

Add it to `env` in `env.ts` with `text(...)`, `int(...)` or `bool(...)` and a default, then to the env files.

## Parallel or sequential

`fullyParallel: true` in the config: every scenario is a separate test, and up to `WORKERS` of them run at the
same time, in separate worker processes. A worker runs one scenario at a time.

| Need | Do |
|---|---|
| more or fewer at once | `WORKERS=8`, or `--workers=8` |
| everything one by one | `--workers=1` (`npm run test:headed` does this) |
| the scenarios of one feature one after the other, in order | tag the feature `@mode:serial` |
| a feature back to normal | `@mode:parallel` / `@mode:default` |

With `@mode:serial`, a failing scenario skips the rest of that feature. Prefer independent scenarios: each one
creates its own data (see [unique-data.md](unique-data.md)), so they don't need an order.

What is shared between scenarios:

| Scope | What |
|---|---|
| per scenario | browser context, pages, `data`, `cleanup`, API clients, mocks |
| per worker | the browser process, the `mq` connection |
| per run | nothing, unless you add `globalSetup` (see [hooks.md](hooks.md#once-per-worker-or-once-per-run)) |

## Tags

Tags are written as in Cucumber (`@api`, `@smoke`). `--grep` matches them as text in the test title, so:

| Cucumber expression (Java `-Dcucumber.filter.tags`) | Here |
|---|---|
| `@api` | `--grep @api` |
| `@api and @smoke` | `--grep "(?=.*@api)(?=.*@smoke)"` |
| `@api or @mq` | `--grep "@api\|@mq"` |
| `not @slow` | `--grep-invert @slow` |

playwright-bdd also reads special tags:

| Tag | Effect |
|---|---|
| `@skip` / `@fixme` | the scenario is skipped |
| `@only` | only these scenarios run (refused in CI by `forbidOnly`) |
| `@slow` | three times the timeout |
| `@fail` | the scenario is expected to fail |
| `@timeout:30000` | its own timeout, in ms |
| `@retries:2` | its own retry count |
| `@mode:serial` (feature) | its scenarios run one after the other |

## Retries

`RETRIES` (or `--retries=N`, or a `@retries:N` tag) lets a failed scenario run again. A retry starts in a **new
worker process** with new fixtures, so nothing from the failed attempt leaks into it: new browser context, new
`data`, and the failed attempt's clean-up has already run.

A scenario that passes on a retry is reported as **flaky**. Keep retries for CI against shared environments;
locally, `RETRIES=0` shows failures straight away.

## Re-running only what failed

```bash
npx playwright test --last-failed
```

Playwright remembers the failed tests of the last run in `test-results/.last-run.json`. Don't run `npm test`
in between: its clean step deletes that file.

## Clean results before each run

`npm test` starts with `scripts/clean.js`, which deletes `allure-results/`, `reports/`, `test-results/` and
`.features-gen/`, so the reports only show this run. To keep earlier results, run the steps yourself:
`npx bddgen && npx playwright test`.

## Debugging

| Want | Do |
|---|---|
| see the browser | `npm run test:headed -- --grep "scenario name"` |
| step through actions | `PWDEBUG=1` (PowerShell `$env:PWDEBUG='1'`) then the test command |
| a time-travel view of a failure | open the trace from `npm run report:html` |
| Playwright's UI mode | `npx bddgen && npx playwright test --ui` |
| breakpoints in VS Code | the Playwright Test extension, on files in `.features-gen/` (they call your steps) |

## CI

There is no CI workflow in this repository. The commands for one:

```bash
cd tests
npm ci
npx playwright install --with-deps chromium
TEST_ENV=ci npm test
```

Then publish `tests/allure-results` (or `reports/allure` after `npm run allure:generate`), `tests/reports/html`
and `tests/test-results` (traces and videos of failures). `@mq` scenarios need a broker reachable from the job,
or run without them: `npm test -- --grep-invert @mq`.

## Prerequisites

- **The app under test** on `BASE_URL`. For the examples: `sample-target-app`,
  `uv run uvicorn app.main:app --port 8000`.
- **A broker** for `@mq`: `npm run mq:start` (Docker) or your own ActiveMQ with AMQP on.
- `@mock` scenarios need neither.
