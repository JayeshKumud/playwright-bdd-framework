import { APIResponse } from '@playwright/test';
import { Customer } from '../api/CustomersApi';
import { ReceivedMessage, Subscription } from '../mq/MessageClient';
import { DataKey, ScenarioData } from './ScenarioData';
import { uniqueSuffix } from './unique';

/** The keys of the data steps share within a scenario. Add new ones here, so every key is typed and named once. */
export const Keys = {
  /** A suffix shared by all the data this scenario creates, so it can find exactly its own data. */
  SUFFIX: DataKey.of<string>('unique suffix'),
  /** The customer the scenario works with ("that customer"). */
  CUSTOMER: DataKey.of<Customer>('customer'),
  /** The last API response, for status and body checks. */
  RESPONSE: DataKey.of<APIResponse>('last API response'),
  /** Queue and topic names the scenario created, by the name used in the feature: "orders" -> "orders.3f9c2a1b". */
  DESTINATIONS: DataKey.of<Map<string, string>>('queues and topics'),
  /** The last message read from a queue or topic. */
  MESSAGE: DataKey.of<ReceivedMessage>('last message'),
  /** Open topic subscriptions, by the name used in the feature. */
  SUBSCRIPTIONS: DataKey.of<Map<string, Subscription>>('topic subscriptions'),
} as const;

/** The scenario's unique suffix, created on first use. */
export function suffixOf(data: ScenarioData): string {
  return data.find(Keys.SUFFIX) ?? data.put(Keys.SUFFIX, uniqueSuffix());
}

/** A name made unique for this scenario: "Ada Lovelace" -> "Ada Lovelace 3f9c2a1b" (same suffix all scenario). */
export function scenarioName(data: ScenarioData, name: string): string {
  return `${name} ${suffixOf(data)}`;
}
