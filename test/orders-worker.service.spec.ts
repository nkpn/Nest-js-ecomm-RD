import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrdersWorkerService } from '../src/orders-worker/orders-worker.service';
import { RabbitmqService } from '../src/rabbitmq/rabbitmq.service';
import { OrdersService } from '../src/orders/order.service';

describe('OrdersWorkerService', () => {
  let service: OrdersWorkerService;
  let rabbitmqService: {
    consume: jest.Mock;
    publishToQueue: jest.Mock;
  };
  let ordersService: {
    processOrderMessage: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersWorkerService,
        {
          provide: RabbitmqService,
          useValue: {
            consume: jest.fn(),
            publishToQueue: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: OrdersService,
          useValue: {
            processOrderMessage: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                ORDERS_MAX_ATTEMPTS: '3',
                ORDERS_RETRY_BASE_DELAY_MS: '1000',
                ORDERS_RETRY_MAX_DELAY_MS: '30000',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersWorkerService>(OrdersWorkerService);
    rabbitmqService = module.get(RabbitmqService);
    ordersService = module.get(OrdersService);
  });

  it('acks only after successful processing', async () => {
    let handler: ((message: any, channel: any) => Promise<void>) | undefined;
    rabbitmqService.consume.mockImplementation(
      async (_queue: string, callback: (message: any, channel: any) => Promise<void>) => {
        handler = callback;
      },
    );

    await service.onApplicationBootstrap();
    expect(handler).toBeDefined();

    const ack = jest.fn();
    const message = {
      content: Buffer.from(
        JSON.stringify({
          messageId: 'm1',
          orderId: 'o1',
          createdAt: new Date().toISOString(),
          attempt: 0,
        }),
      ),
    };

    ordersService.processOrderMessage.mockResolvedValue(undefined);
    await handler!(message, { ack, nack: jest.fn() });

    expect(ordersService.processOrderMessage).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(
      ordersService.processOrderMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(ack.mock.invocationCallOrder[0]);
  });

  it('acks duplicate deliveries without retry publish', async () => {
    let handler: ((message: any, channel: any) => Promise<void>) | undefined;
    rabbitmqService.consume.mockImplementation(
      async (_queue: string, callback: (message: any, channel: any) => Promise<void>) => {
        handler = callback;
      },
    );

    await service.onApplicationBootstrap();

    const ack = jest.fn();
    const message = {
      content: Buffer.from(
        JSON.stringify({
          messageId: 'm-dedup',
          orderId: 'o1',
          createdAt: new Date().toISOString(),
          attempt: 0,
        }),
      ),
    };

    ordersService.processOrderMessage.mockResolvedValue({
      outcome: 'deduplicated',
      orderId: 'o1',
    });

    await handler!(message, { ack, nack: jest.fn() });

    expect(rabbitmqService.publishToQueue).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('requeues message with incremented attempt on transient failure and delay', async () => {
    let handler: ((message: any, channel: any) => Promise<void>) | undefined;
    rabbitmqService.consume.mockImplementation(
      async (_queue: string, callback: (message: any, channel: any) => Promise<void>) => {
        handler = callback;
      },
    );

    await service.onApplicationBootstrap();

    const ack = jest.fn();
    const message = {
      content: Buffer.from(
        JSON.stringify({
          messageId: 'm-retry',
          orderId: 'o1',
          createdAt: new Date().toISOString(),
          attempt: 1,
          correlationId: 'o1',
        }),
      ),
    };

    ordersService.processOrderMessage.mockRejectedValue(new Error('temporary'));
    await handler!(message, { ack, nack: jest.fn() });

    expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
      'orders.retry.process',
      expect.objectContaining({ messageId: 'm-retry', attempt: 2 }),
      expect.objectContaining({
        messageId: 'm-retry',
        correlationId: 'o1',
        expiration: '2000',
      }),
    );
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('sends to DLQ after max attempts', async () => {
    let handler: ((message: any, channel: any) => Promise<void>) | undefined;
    rabbitmqService.consume.mockImplementation(
      async (_queue: string, callback: (message: any, channel: any) => Promise<void>) => {
        handler = callback;
      },
    );

    await service.onApplicationBootstrap();

    const ack = jest.fn();
    const message = {
      content: Buffer.from(
        JSON.stringify({
          messageId: 'm-dlq',
          orderId: 'o1',
          createdAt: new Date().toISOString(),
          attempt: 2,
          correlationId: 'o1',
        }),
      ),
    };

    ordersService.processOrderMessage.mockRejectedValue(new Error('permanent'));
    await handler!(message, { ack, nack: jest.fn() });

    expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
      'orders.dlq',
      expect.objectContaining({ messageId: 'm-dlq', attempt: 2 }),
      expect.objectContaining({ messageId: 'm-dlq', correlationId: 'o1' }),
    );
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('routes invalid JSON to DLQ and acks', async () => {
    let handler: ((message: any, channel: any) => Promise<void>) | undefined;
    rabbitmqService.consume.mockImplementation(
      async (_queue: string, callback: (message: any, channel: any) => Promise<void>) => {
        handler = callback;
      },
    );

    await service.onApplicationBootstrap();

    const ack = jest.fn();
    const message = {
      content: Buffer.from('bad json'),
    };

    await handler!(message, { ack, nack: jest.fn() });

    expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
      'orders.dlq',
      expect.objectContaining({ reason: 'invalid_json' }),
    );
    expect(ack).toHaveBeenCalledTimes(1);
  });
});
