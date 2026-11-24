# Messaging with ActiveMQ

Scenarios send and read messages on queues and topics through the **`mq` fixture**, a
[`MessageClient`](../src/mq/MessageClient.ts). Behind it is [`AmqpMessageClient`](../src/mq/AmqpMessageClient.ts),
which speaks **AMQP 1.0** with the `rhea` library. ActiveMQ Classic (5.x / 6.x) and ActiveMQ Artemis both accept
AMQP, on port 5672 by default.

```gherkin
Background:
  Given a new queue "orders"

Scenario: A JSON message is read back from a queue
  When I send the JSON message to queue "orders":
    """
    { "orderId": "A-1001", "customer": { "name": "Ada Lovelace" } }
    """
  Then I read a message from queue "orders"
  And the message field "customer.name" is "Ada Lovelace"
  And queue "orders" has no more messages
```

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `MessageClient` | `src/mq/MessageClient.ts` | the interface steps use: `send`, `receive`, `receiveMatching`, `subscribe`, `close` |
| `AmqpMessageClient` | `src/mq/AmqpMessageClient.ts` | the AMQP 1.0 implementation |
| `queue(name)`, `topic(name)` | `src/mq/MessageClient.ts` | a `Destination` |
| `mq` fixture | `src/fixtures/test.ts` | **worker-scoped**: one client and one connection per worker, closed when the worker ends |
| steps | `src/steps/mq/messaging.steps.ts` | send, read, subscribe, check fields and properties |
| settings | `MQ_*` in `env/<TEST_ENV>.env` | host, port, user, password, receive timeout, address prefixes |
| local broker | `docker/activemq.compose.yml` | `npm run mq:start` / `mq:stop` |

## The client

```ts
await mq.send(queue('orders'), { body: { orderId: 'A-1' }, properties: { type: 'created' } });

const message = await mq.receive(queue('orders'));                              // the next message
const cancelled = await mq.receive(queue('orders'), { selector: "type = 'cancelled'" });
const a2 = await mq.receiveMatching(queue('orders'), (m) => (m.json as any)?.orderId === 'A-2');

const subscription = await mq.subscribe(topic('order-events'));                 // before publishing
await mq.send(topic('order-events'), { body: { event: 'order.created' } });
const event = await subscription.waitFor((m) => (m.json as any)?.event === 'order.created');
await subscription.close();
```

| Method | Does |
|---|---|
| `send(to, message)` | sends and waits until the broker **accepted** it; fails if it is rejected or released |
| `receive(from, { selector?, timeoutMs? })` | reads (consumes) the next message, or the next matching the selector |
| `receiveMatching(from, match, options?)` | reads messages until one matches; the ones before it are consumed too |
| `subscribe(to, { selector? })` | starts collecting messages; `waitFor(match?, timeoutMs?)` returns the first match |

Messages:

| Field | Outgoing | Received |
|---|---|---|
| body | `string`, or an object sent as JSON with `content_type: application/json` | `text` (always), `json` (if it parses) |
| `properties` | application properties, for selectors | the same |
| `correlationId`, `subject` | optional | the same, plus `messageId` |
| `durable` | default `true` | — |

When nothing arrives in time, the error says what was read instead:
`No matching message on queue "qa.orders.3f9c2a1b" within 10000 ms; read 2 other message(s): {...} | {...}`.

## Isolation

Reading a queue **consumes** its messages, and parallel scenarios share the broker. So:

- `Given a new queue "orders"` gives the scenario its own queue, `qa.orders.<suffix>` (see
  [unique-data.md](unique-data.md)). Every later step that says `queue "orders"` uses that name. The mapping is
  stored in `data` under `Keys.DESTINATIONS`.
- `Given a new topic "order-events"` does the same for a topic.
- A queue named **without** that step is used as it is: that is how a scenario reads or writes your
  application's real queues. Use a selector or `receiveMatching` there, so you only consume your own messages.
- Topic subscriptions are closed after the scenario by the `cleanup` fixture.

## Connection

- **One connection per worker.** It opens on the first `send` / `receive` / `subscribe`; a worker that runs only
  GUI scenarios never connects. Each receive opens its own short-lived receiver link, so scenarios don't
  interfere on the shared connection.
- **A failed connect is retried** on the next call, and says what to do:
  `Cannot connect to ActiveMQ at localhost:5672 (AMQP): ... Is the broker running? (npm run mq:start)`.
- **Closed when the worker ends**, by the fixture tear-down, with a 2-second limit so a broker that does not answer
  can't hang the run.

## Broker settings

| Setting | Default | Meaning |
|---|---|---|
| `MQ_HOST`, `MQ_PORT` | `localhost`, `5672` | where the AMQP connector listens |
| `MQ_USERNAME`, `MQ_PASSWORD` | `admin`, `admin` | set the password as a CI secret, not in `ci.env` |
| `MQ_RECEIVE_TIMEOUT_MS` | `10000` | how long `receive` and `waitFor` wait |
| `MQ_QUEUE_PREFIX` | empty | address prefix that marks a queue |
| `MQ_TOPIC_PREFIX` | `topic://` | address prefix that marks a topic |

The destination type is sent two ways, so both brokers understand it: as the address prefix and as the AMQP
terminus capability (`queue` / `topic`).

- **ActiveMQ Classic 6.4 ships with AMQP switched off.** `docker/activemq/activemq.xml` is the default config
  with the AMQP connector on. For a shared broker, ask for
  `<transportConnector name="amqp" uri="amqp://0.0.0.0:5672"/>`.
- **Artemis:** set `MQ_QUEUE_PREFIX` / `MQ_TOPIC_PREFIX` to the AMQP acceptor's `anycastPrefix` /
  `multicastPrefix`, if it has any.

## Local broker

```bash
npm run mq:start      # apache/activemq-classic:6.4.0; AMQP 5672, OpenWire 61616
                      # web console http://localhost:8161 (admin / admin)
npm run test:mq
npm run mq:stop
```

## Adding steps

Steps use only the `MessageClient` interface, so a different protocol (OpenWire, STOMP) would be a new class
implementing it and a one-line change in the `mq` fixture. Keep new steps in `steps/mq/messaging.steps.ts` and
resolve names with `destination(data, 'queue', name)`, so `a new queue` keeps working.
