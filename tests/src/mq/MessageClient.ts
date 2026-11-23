/** A queue (point to point: one consumer gets each message) or a topic (publish/subscribe: every subscriber gets it). */
export type Destination = { type: 'queue' | 'topic'; name: string };

export const queue = (name: string): Destination => ({ type: 'queue', name });
export const topic = (name: string): Destination => ({ type: 'topic', name });

/** A message to send. An object body is sent as JSON text with content type application/json. */
export type OutgoingMessage = {
  body: string | object;
  /** Application properties; consumers can filter on them with a selector, for example "type = 'created'". */
  properties?: Record<string, string | number | boolean>;
  correlationId?: string;
  subject?: string;
  /** Persistent message (survives a broker restart). Default true. */
  durable?: boolean;
};

/** A message that was read. */
export type ReceivedMessage = {
  /** The body as text, whatever its type was. */
  text: string;
  /** The body parsed as JSON, or undefined if it is not JSON. */
  json?: unknown;
  properties: Record<string, unknown>;
  messageId?: string;
  correlationId?: string;
  subject?: string;
};

export type ReceiveOptions = {
  /** JMS-style selector on the message properties, for example "type = 'created' AND priority > 3". */
  selector?: string;
  /** How long to wait, in milliseconds; MQ_RECEIVE_TIMEOUT_MS by default. */
  timeoutMs?: number;
};

/** Messages a topic subscription has received so far; subscribe before the message is published. */
export interface Subscription {
  readonly messages: ReceivedMessage[];
  /** Waits until a received message matches, and returns it. */
  waitFor(match?: (m: ReceivedMessage) => boolean, timeoutMs?: number): Promise<ReceivedMessage>;
  close(): Promise<void>;
}

/**
 * Sends and reads messages on a message broker. Steps use this interface only, so the protocol behind it
 * (AMQP 1.0 today, {@link AmqpMessageClient}) can change in one class.
 */
export interface MessageClient {
  /** Sends a message and waits until the broker has accepted it. */
  send(to: Destination, message: OutgoingMessage): Promise<void>;
  /**
   * Reads (consumes) the next message of a queue, or the next one matching the selector.
   *
   * @throws Error if none arrives within the timeout
   */
  receive(from: Destination, options?: ReceiveOptions): Promise<ReceivedMessage>;
  /**
   * Reads messages of a queue until one matches `match`, and returns it. Messages read before it are consumed:
   * use a queue that belongs to the scenario (see the "a new queue" step) or a selector.
   */
  receiveMatching(from: Destination, match: (m: ReceivedMessage) => boolean, options?: ReceiveOptions): Promise<ReceivedMessage>;
  /** Starts collecting the messages of a topic (or queue). */
  subscribe(to: Destination, options?: Pick<ReceiveOptions, 'selector'>): Promise<Subscription>;
  close(): Promise<void>;
}
