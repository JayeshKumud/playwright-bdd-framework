import {
  Connection,
  create_container,
  EventContext,
  filter,
  Message,
  Receiver,
  ReceiverOptions,
} from 'rhea';
import {
  Destination,
  MessageClient,
  OutgoingMessage,
  ReceivedMessage,
  ReceiveOptions,
  Subscription,
} from './MessageClient';

/** Where and how to connect. Address prefixes differ between brokers, see {@link AmqpMessageClient}. */
export type AmqpSettings = {
  host: string;
  port: number;
  username: string;
  password: string;
  receiveTimeoutMs: number;
  /** Prefix that makes an address a queue; '' for ActiveMQ Classic and Artemis (queue is their default). */
  queuePrefix?: string;
  /** Prefix that makes an address a topic; 'topic://' for ActiveMQ Classic and for Artemis' default AMQP acceptor. */
  topicPrefix?: string;
};

/**
 * {@link MessageClient} over AMQP 1.0 with the rhea library: works with ActiveMQ Classic (5.x/6.x) and ActiveMQ
 * Artemis, both of which accept AMQP on port 5672. One connection per worker process, opened on first use; every
 * receive opens its own short-lived receiver link, so parallel scenarios on one connection do not interfere.
 *
 * The destination type is sent two ways, so both brokers understand it: as an address prefix (topic:// by default)
 * and as the AMQP terminus capability ("queue" / "topic").
 */
export class AmqpMessageClient implements MessageClient {
  private connection?: Promise<Connection>;

  constructor(private readonly settings: AmqpSettings) {}

  async send(to: Destination, message: OutgoingMessage): Promise<void> {
    const connection = await this.connect();
    const sender = connection.open_sender({ target: { address: this.address(to), capabilities: [to.type] } });
    try {
      await new Promise<void>((resolve, reject) => {
        sender.once('sendable', () => sender.send(toAmqp(message)));
        sender.once('accepted', () => resolve());
        sender.once('rejected', (c: EventContext) => reject(new Error(`The broker rejected the message to ${describe(to)}: ${errorText(c.delivery?.remote_state?.error)}`)));
        sender.once('released', () => reject(new Error(`The broker released the message to ${describe(to)} (no consumer accepted it)`)));
        sender.once('sender_error', (c: EventContext) => reject(new Error(`Cannot send to ${describe(to)}: ${errorText(c.sender?.error)}`)));
      });
    } finally {
      sender.close();
    }
  }

  async receive(from: Destination, options: ReceiveOptions = {}): Promise<ReceivedMessage> {
    return this.receiveMatching(from, () => true, options);
  }

  async receiveMatching(
    from: Destination,
    match: (m: ReceivedMessage) => boolean,
    options: ReceiveOptions = {},
  ): Promise<ReceivedMessage> {
    const timeoutMs = options.timeoutMs ?? this.settings.receiveTimeoutMs;
    const seen: ReceivedMessage[] = [];
    const receiver = await this.openReceiver(from, options.selector);
    try {
      return await withTimeout(
        new Promise<ReceivedMessage>((resolve) => {
          receiver.on('message', (c: EventContext) => {
            const received = fromAmqp(c.message!);
            c.delivery?.accept();
            seen.push(received);
            if (match(received)) resolve(received);
          });
          receiver.add_credit(100);
        }),
        timeoutMs,
        () => `No matching message on ${describe(from)}${options.selector ? ` with selector "${options.selector}"` : ''} `
          + `within ${timeoutMs} ms; read ${seen.length} other message(s)${seen.length ? `: ${seen.map((m) => m.text).join(' | ').slice(0, 500)}` : ''}`,
      );
    } finally {
      receiver.close();
    }
  }

  async subscribe(to: Destination, options: Pick<ReceiveOptions, 'selector'> = {}): Promise<Subscription> {
    const receiver = await this.openReceiver(to, options.selector);
    const messages: ReceivedMessage[] = [];
    const waiters: (() => void)[] = [];
    receiver.on('message', (c: EventContext) => {
      messages.push(fromAmqp(c.message!));
      c.delivery?.accept();
      waiters.splice(0).forEach((wake) => wake());
    });
    receiver.add_credit(1000);
    const defaultTimeout = this.settings.receiveTimeoutMs;
    return {
      messages,
      async waitFor(match = () => true, timeoutMs = defaultTimeout) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const found = messages.find(match);
          if (found) return found;
          const left = deadline - Date.now();
          if (left <= 0) {
            throw new Error(`No matching message on ${describe(to)} within ${timeoutMs} ms; received ${messages.length}`
              + (messages.length ? `: ${messages.map((m) => m.text).join(' | ').slice(0, 500)}` : ''));
          }
          await new Promise<void>((wake) => {
            const timer = setTimeout(wake, left);
            waiters.push(() => { clearTimeout(timer); wake(); });
          });
        }
      },
      async close() {
        receiver.close();
      },
    };
  }

  async close(): Promise<void> {
    if (!this.connection) return;
    const connection = await this.connection.catch(() => undefined);
    this.connection = undefined;
    if (!connection || !connection.is_open()) return;
    await new Promise<void>((resolve) => {
      connection.once('connection_close', () => resolve());
      connection.once('disconnected', () => resolve());
      connection.close();
      setTimeout(resolve, 2000); // never hang the worker on shutdown
    });
  }

  /** The worker's connection, opened on first use. */
  private connect(): Promise<Connection> {
    this.connection ??= new Promise<Connection>((resolve, reject) => {
      const { host, port, username, password } = this.settings;
      const connection = create_container().connect({ host, port, username, password, reconnect: false });
      connection.once('connection_open', () => resolve(connection));
      connection.once('connection_error', (c: EventContext) => reject(new Error(`ActiveMQ refused the connection: ${errorText(c.connection.error)}`)));
      connection.once('disconnected', (c: EventContext) =>
        reject(new Error(`Cannot connect to ActiveMQ at ${host}:${port} (AMQP): ${errorText(c.error)}. Is the broker running? (npm run mq:start)`)));
    }).catch((error) => {
      this.connection = undefined; // the next call tries again
      throw error;
    });
    return this.connection;
  }

  /** Opens a receiver without credit; callers add credit once their message handler is attached. */
  private async openReceiver(from: Destination, selector?: string): Promise<Receiver> {
    const connection = await this.connect();
    const source: ReceiverOptions['source'] = { address: this.address(from), capabilities: [from.type] };
    if (selector) source.filter = filter.selector(selector);
    const receiver = connection.open_receiver({ source, credit_window: 0, autoaccept: false });
    await new Promise<void>((resolve, reject) => {
      receiver.once('receiver_open', () => resolve());
      receiver.once('receiver_error', (c: EventContext) => reject(new Error(`Cannot read from ${describe(from)}: ${errorText(c.receiver?.error)}`)));
    });
    return receiver;
  }

  private address(destination: Destination): string {
    const prefix = destination.type === 'topic' ? (this.settings.topicPrefix ?? 'topic://') : (this.settings.queuePrefix ?? '');
    return prefix + destination.name;
  }
}

function toAmqp(message: OutgoingMessage): Message {
  const isText = typeof message.body === 'string';
  return {
    body: isText ? message.body : JSON.stringify(message.body),
    content_type: isText ? 'text/plain' : 'application/json',
    application_properties: message.properties,
    correlation_id: message.correlationId,
    subject: message.subject,
    durable: message.durable ?? true,
  };
}

function fromAmqp(message: Message): ReceivedMessage {
  const text = bodyText(message.body);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return {
    text,
    json,
    properties: { ...(message.application_properties ?? {}) },
    messageId: message.message_id === undefined ? undefined : String(message.message_id),
    correlationId: message.correlation_id === undefined ? undefined : String(message.correlation_id),
    subject: message.subject,
  };
}

/** A body as text: a string, a binary section (Buffer, rhea's `content`), or anything else as JSON. */
function bodyText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body && typeof body === 'object' && 'content' in body && Buffer.isBuffer((body as { content: unknown }).content)) {
    return (body as { content: Buffer }).content.toString('utf8');
  }
  return JSON.stringify(body);
}

function describe(destination: Destination): string {
  return `${destination.type} "${destination.name}"`;
}

function errorText(error: unknown): string {
  if (!error) return 'no details';
  // A refused connection is an AggregateError (one error per address tried) whose own message is empty.
  if (error instanceof AggregateError && error.errors.length) return error.errors.map(errorText).join('; ');
  if (error instanceof Error) return error.message || (error as NodeJS.ErrnoException).code || error.name;
  if (typeof error === 'object' && 'description' in error) return String((error as { description: unknown }).description);
  return String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: () => string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message())), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
