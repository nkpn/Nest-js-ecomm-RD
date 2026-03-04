import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RabbitConsumeMessage = {
  content: Buffer;
};

export type RabbitChannel = {
  assertQueue: (
    queue: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  consume: (
    queue: string,
    onMessage: (message: RabbitConsumeMessage | null) => Promise<void>,
    options: { noAck: boolean },
  ) => Promise<unknown>;
  ack: (message: RabbitConsumeMessage) => void;
  nack: (
    message: RabbitConsumeMessage,
    allUpTo?: boolean,
    requeue?: boolean,
  ) => void;
  prefetch: (count: number) => Promise<unknown>;
  sendToQueue: (
    queue: string,
    content: Buffer,
    options: Record<string, unknown>,
  ) => boolean;
  close: () => Promise<void>;
};

type RabbitConnection = {
  close: () => Promise<void>;
  createChannel: () => Promise<RabbitChannel>;
};

type PublishOptions = {
  messageId?: string;
  correlationId?: string;
  timestamp?: number;
  expiration?: string;
};

export type RabbitConsumeHandler = (
  message: RabbitConsumeMessage,
  channel: RabbitChannel,
) => Promise<void>;

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: RabbitConnection | null = null;
  private channel: RabbitChannel | null = null;
  private enabled = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.getBrokerUrl();
    if (!url) {
      this.logger.warn(
        'RabbitMQ is disabled because RABBITMQ_URL is not configured for this environment',
      );
      return;
    }

    let amqp: { connect: (target: string) => Promise<RabbitConnection> };
    try {
      amqp = require('amqplib') as {
        connect: (target: string) => Promise<RabbitConnection>;
      };
    } catch (error) {
      this.logger.error(
        'RabbitMQ client is not installed. Run npm install to add amqplib.',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    const prefetch = Number(this.configService.get('RABBITMQ_PREFETCH') ?? 10);
    await this.channel.prefetch(prefetch);

    // Main queue consumed by worker.
    await this.channel.assertQueue('orders.process', { durable: true });
    // Retry queue is never consumed directly; TTL expiration sends messages back to orders.process.
    await this.channel.assertQueue('orders.retry.process', {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: 'orders.process',
    });
    // Terminal queue for poisoned messages after retry limit.
    await this.channel.assertQueue('orders.dlq', { durable: true });

    this.enabled = true;
    this.logger.log(
      `RabbitMQ connected and orders topology asserted (prefetch=${prefetch})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
    } finally {
      await this.connection?.close();
    }
  }

  publishToQueue(
    queue: string,
    payload: unknown,
    options?: PublishOptions,
  ): boolean {
    if (!this.enabled || !this.channel) {
      this.logger.warn(
        `RabbitMQ publish skipped because channel is not ready: ${queue}`,
      );
      return false;
    }

    return this.channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      {
        contentType: 'application/json',
        persistent: true,
        ...options,
      },
    );
  }

  async consume(
    queue: string,
    handler: RabbitConsumeHandler,
  ): Promise<void> {
    if (!this.enabled || !this.channel) {
      throw new Error('RabbitMQ consume requested before channel initialization');
    }

    await this.channel.consume(
      queue,
      async (message) => {
        if (!message) {
          return;
        }

        try {
          await handler(message, this.channel as RabbitChannel);
        } catch (error) {
          this.logger.error(
            `Unhandled consumer error for queue=${queue}`,
            error instanceof Error ? error.stack : String(error),
          );
          this.channel?.nack(message, false, true);
        }
      },
      { noAck: false },
    );
  }

  private getBrokerUrl(): string | null {
    const configuredUrl = this.configService.get<string>('RABBITMQ_URL');
    if (configuredUrl) {
      return configuredUrl;
    }

    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'test') {
      return null;
    }

    return 'amqp://guest:guest@localhost:5672';
  }
}
