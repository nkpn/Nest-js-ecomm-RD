import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RabbitChannel,
  RabbitConsumeMessage,
  RabbitmqService,
} from '../rabbitmq/rabbitmq.service';
import { OrdersService } from '../orders/order.service';
import { OrderProcessMessage } from '../orders/order-process-message.type';

@Injectable()
export class OrdersWorkerService implements OnApplicationBootstrap {
  private readonly processQueue = 'orders.process';
  private readonly retryQueue = 'orders.retry.process';
  private readonly dlqQueue = 'orders.dlq';
  private readonly logger = new Logger(OrdersWorkerService.name);
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {
    this.maxAttempts = this.parsePositiveInt(
      this.configService.get('ORDERS_MAX_ATTEMPTS'),
      3,
    );
    this.retryBaseDelayMs = this.parsePositiveInt(
      this.configService.get('ORDERS_RETRY_BASE_DELAY_MS'),
      1000,
    );
    this.retryMaxDelayMs = this.parsePositiveInt(
      this.configService.get('ORDERS_RETRY_MAX_DELAY_MS'),
      30000,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    // Worker consumes only the main queue. Retries are re-routed back here via retry queue DLX.
    await this.rabbitmqService.consume(this.processQueue, async (message, channel) => {
      await this.handleMessage(message, channel);
    });
    this.logger.log(
      `Orders worker subscribed to ${this.processQueue} (maxAttempts=${this.maxAttempts}, baseDelayMs=${this.retryBaseDelayMs}, maxDelayMs=${this.retryMaxDelayMs})`,
    );
  }

  private async handleMessage(
    message: RabbitConsumeMessage,
    channel: RabbitChannel,
  ): Promise<void> {
    let payload: OrderProcessMessage;

    try {
      // Invalid payloads are not retriable; move them to DLQ for manual inspection.
      payload = JSON.parse(message.content.toString('utf-8')) as OrderProcessMessage;
    } catch {
      const published = this.rabbitmqService.publishToQueue(this.dlqQueue, {
        reason: 'invalid_json',
        raw: message.content.toString('base64'),
      });
      if (!published) {
        throw new Error(`Failed to publish message to ${this.dlqQueue}`);
      }
      this.logDeliveryResult({
        messageId: '(invalid_json)',
        orderId: '(invalid_json)',
        attempt: 0,
        result: 'dlq',
        reason: 'invalid_json',
      });
      channel.ack(message);
      return;
    }

    // attempt is zero-based (0 = first processing attempt).
    const attempt =
      Number.isInteger(payload.attempt) && payload.attempt >= 0
        ? payload.attempt
        : 0;

    try {
      // Ack only after the DB transaction commits inside processOrderMessage.
      await this.ordersService.processOrderMessage({ ...payload, attempt });
      this.logDeliveryResult({
        messageId: payload.messageId ?? '(missing)',
        orderId: payload.orderId ?? '(missing)',
        attempt,
        result: 'success',
        reason: 'processed',
      });
      channel.ack(message);
      return;
    } catch (error) {
      const messageId = payload.messageId ?? '(missing)';
      const orderId = payload.orderId ?? '(missing)';
      const errorReason = this.getShortErrorReason(error);

      // With maxAttempts=3 and zero-based attempts, 0/1 are retriable and 2 goes to DLQ.
      const isLastAttempt = attempt >= this.maxAttempts - 1;
      if (isLastAttempt) {
        const published = this.rabbitmqService.publishToQueue(
          this.dlqQueue,
          {
            ...payload,
            attempt,
            failedAt: new Date().toISOString(),
            errorReason,
          },
          {
            messageId: payload.messageId,
            correlationId: payload.correlationId,
          },
        );
        if (!published) {
          throw new Error(`Failed to publish message to ${this.dlqQueue}`);
        }
        this.logDeliveryResult({
          messageId,
          orderId,
          attempt,
          result: 'dlq',
          reason: errorReason,
        });
        channel.ack(message);
        return;
      }

      const nextAttempt = attempt + 1;
      const delayMs = this.computeRetryDelayMs(nextAttempt);
      const published = this.rabbitmqService.publishToQueue(
        // Retry queue applies TTL delay and dead-letters message back to orders.process.
        this.retryQueue,
        {
          ...payload,
          attempt: nextAttempt,
          retryAt: new Date(Date.now() + delayMs).toISOString(),
          errorReason,
        },
        {
          messageId: payload.messageId,
          correlationId: payload.correlationId,
          expiration: String(delayMs),
        },
      );
      if (!published) {
        throw new Error(`Failed to publish message to ${this.retryQueue}`);
      }
      this.logDeliveryResult({
        messageId,
        orderId,
        attempt,
        result: 'retry',
        reason: `${errorReason}; nextAttempt=${nextAttempt}; delayMs=${delayMs}`,
      });
      channel.ack(message);
    }
  }

  private computeRetryDelayMs(nextAttempt: number): number {
    // Exponential backoff: 1s, 2s, 4s ... limited by retryMaxDelayMs.
    const backoff = this.retryBaseDelayMs * Math.pow(2, Math.max(0, nextAttempt - 1));
    return Math.min(backoff, this.retryMaxDelayMs);
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    // Keep runtime behavior predictable even if env values are missing or malformed.
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }

  private getShortErrorReason(error: unknown): string {
    const raw =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : String(error);
    const firstLine = raw.split('\n')[0] ?? 'unknown_error';
    return firstLine.slice(0, 160);
  }

  private logDeliveryResult(input: {
    messageId: string;
    orderId: string;
    attempt: number;
    result: 'success' | 'retry' | 'dlq';
    reason: string;
  }): void {
    const line = `result=${input.result} messageId=${input.messageId} orderId=${input.orderId} attempt=${input.attempt} reason=${input.reason}`;
    if (input.result === 'success') {
      this.logger.log(line);
      return;
    }
    this.logger.warn(line);
  }
}
