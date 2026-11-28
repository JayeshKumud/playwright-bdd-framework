# Documentation

How the framework works, and what each part of the Java framework (agentic-qa-java) became here.

## Start here

| Page | Read it for |
|---|---|
| [java-equivalents.md](java-equivalents.md) | **every Java piece and what replaces it**: `TestSession`, PicoContainer, hooks, `ApiFactory`, `Settings`, ... |
| [architecture.md](architecture.md) | layers, components, what happens on `npm test`, a scenario's lifecycle, extension points |
| [explanation.md](explanation.md) | questions and answers: how a step gets its objects, `TestSession.current()`, breakpoints, ... |

## How it works

| Page | Covers |
|---|---|
| [fixtures.md](fixtures.md) | every fixture, set-up and tear-down, scenario vs worker scope, adding one |
| [hooks.md](hooks.md) | `Before`, `After`, `AfterStep`, `BeforeAll`; hook or fixture; order |
| [keys.md](keys.md) | sharing data between steps: `data`, `DataKey<T>`, `Keys` |
| [unique-data.md](unique-data.md) | unique names per scenario, so parallel runs never clash |

## Writing tests

| Page | Covers |
|---|---|
| [api.md](api.md) | API clients on the browser context, sharing data with GUI steps, clean-up |
| [page-objects.md](page-objects.md) | page objects as fixtures, popups (`windows`), grids (`GridLibrary`) |
| [multiple-grids.md](multiple-grids.md) | several grids on one page: `I use the grid with column "..."`, `I use the grid in "..."`, `grid('column')`, `gridIn('container')`, `root()`, how long a choice lasts, errors, limits |
| [locators.md](locators.md) | locator JSON files and `PageElements` |
| [locator-guide.md](locator-guide.md) | finding an element and choosing a selector that keeps working |
| [messaging.md](messaging.md) | ActiveMQ over AMQP 1.0: queues, topics, selectors, isolation |
| [backend-mock.md](backend-mock.md) | testing a frontend against a mocked backend |

## Running and results

| Page | Covers |
|---|---|
| [running-tests.md](running-tests.md) | commands, environments and settings, tags, parallel runs, retries, debugging, CI |
| [reporting.md](reporting.md) | the reports, what each failed scenario gets attached, traces |

## Not here

The Java framework's **self-healing locators** (`healing.md`) have no equivalent in this framework.
