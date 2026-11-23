import { DataTable } from 'playwright-bdd';
import { Keys, suffixOf } from '../../core/keys';
import { ScenarioData } from '../../core/ScenarioData';
import { expect, Given, Then, When } from '../../fixtures/test';
import { Destination, OutgoingMessage, queue, ReceivedMessage, topic } from '../../mq/MessageClient';

// Steps for ActiveMQ (AMQP 1.0). A queue or topic named in a feature is the real destination, unless the scenario
// created it with "a new queue/topic": then it gets a unique name, so parallel scenarios never read each other's
// messages. Read messages are consumed (removed from the queue).

/** The real destination name for a name used in the feature. */
function destination(data: ScenarioData, type: 'queue' | 'topic', name: string): Destination {
  const real = data.find(Keys.DESTINATIONS)?.get(`${type}:${name}`) ?? name;
  return type === 'queue' ? queue(real) : topic(real);
}

function remember(data: ScenarioData, type: 'queue' | 'topic', name: string): void {
  const names = data.find(Keys.DESTINATIONS) ?? data.put(Keys.DESTINATIONS, new Map());
  names.set(`${type}:${name}`, `qa.${name}.${suffixOf(data)}`);
}

function properties(table?: DataTable): OutgoingMessage['properties'] {
  if (!table) return undefined;
  return Object.fromEntries(table.raw().map(([key, value]) => [key, /^-?\d+$/.test(value) ? Number(value) : value]));
}

/** A value inside the JSON body by a dot path: "customer.name", "items.0.sku". */
function jsonField(message: ReceivedMessage, path: string): unknown {
  expect(message.json, `the message body is JSON: ${message.text}`).toBeDefined();
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], message.json);
}

Given('a new queue {string}', async ({ data }, name: string) => {
  remember(data, 'queue', name);
});

Given('a new topic {string}', async ({ data }, name: string) => {
  remember(data, 'topic', name);
});

When('I send the JSON message to queue {string}:', async ({ mq, data }, name: string, json: string) => {
  await mq.send(destination(data, 'queue', name), { body: JSON.parse(json) as object });
});

When('I send the text message {string} to queue {string}', async ({ mq, data }, text: string, name: string) => {
  await mq.send(destination(data, 'queue', name), { body: text });
});

When(
  'I send the text message {string} to queue {string} with properties:',
  async ({ mq, data }, text: string, name: string, table: DataTable) => {
    await mq.send(destination(data, 'queue', name), { body: text, properties: properties(table) });
  },
);

When('I publish the JSON message to topic {string}:', async ({ mq, data }, name: string, json: string) => {
  await mq.send(destination(data, 'topic', name), { body: JSON.parse(json) as object });
});

Given('I subscribe to topic {string}', async ({ mq, data, cleanup }, name: string) => {
  const subscription = await mq.subscribe(destination(data, 'topic', name));
  const subscriptions = data.find(Keys.SUBSCRIPTIONS) ?? data.put(Keys.SUBSCRIPTIONS, new Map());
  subscriptions.set(name, subscription);
  cleanup.add(`close subscription to topic ${name}`, () => subscription.close());
});

Then('I read a message from queue {string}', async ({ mq, data }, name: string) => {
  data.put(Keys.MESSAGE, await mq.receive(destination(data, 'queue', name)));
});

Then('I read a message from queue {string} with selector {string}', async ({ mq, data }, name: string, selector: string) => {
  data.put(Keys.MESSAGE, await mq.receive(destination(data, 'queue', name), { selector }));
});

Then(
  'queue {string} has a JSON message where {string} is {string}',
  async ({ mq, data }, name: string, path: string, expected: string) => {
    const message = await mq.receiveMatching(destination(data, 'queue', name), (m) => String(jsonField(m, path)) === expected);
    data.put(Keys.MESSAGE, message);
  },
);

Then(
  'the subscription to topic {string} receives a JSON message where {string} is {string}',
  async ({ data }, name: string, path: string, expected: string) => {
    const subscription = data.get(Keys.SUBSCRIPTIONS).get(name);
    expect(subscription, `subscribed to topic "${name}" in an earlier step`).toBeDefined();
    data.put(Keys.MESSAGE, await subscription!.waitFor((m) => m.json !== undefined && String(jsonField(m, path)) === expected));
  },
);

Then('the message text is {string}', async ({ data }, text: string) => {
  expect(data.get(Keys.MESSAGE).text).toBe(text);
});

Then('the message field {string} is {string}', async ({ data }, path: string, expected: string) => {
  expect(String(jsonField(data.get(Keys.MESSAGE), path))).toBe(expected);
});

Then('the message property {string} is {string}', async ({ data }, property: string, expected: string) => {
  expect(String(data.get(Keys.MESSAGE).properties[property])).toBe(expected);
});

Then('queue {string} has no more messages', async ({ mq, data }, name: string) => {
  const leftOver = await mq.receive(destination(data, 'queue', name), { timeoutMs: 1500 }).catch(() => undefined);
  expect(leftOver?.text, 'no message left on the queue').toBeUndefined();
});
