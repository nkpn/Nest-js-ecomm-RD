import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Order, OrderStatus } from '../src/orders/entity/order.entity';
import { OrdersService } from '../src/orders/order.service';
import { Product } from '../src/products/entity/product.entity';
import { User } from '../src/users/entity/user.entity';
import { OrdersEventsService } from '../src/orders/orders-events.service';
import { RabbitmqService } from '../src/rabbitmq/rabbitmq.service';
import { OrderProcessMessage } from '../src/orders/order-process-message.type';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: Repository<Order>;
  let usersRepo: Repository<User>;
  let dataSource: DataSource;
  let rabbitmqService: { publishToQueue: jest.Mock };
  let ordersEventsService: { publishStatusChanged: jest.Mock };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      create: jest.Mock;
      save: jest.Mock;
      findOne: jest.Mock;
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
            transaction: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Order),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: OrdersEventsService,
          useValue: {
            publishStatusChanged: jest.fn(),
          },
        },
        {
          provide: RabbitmqService,
          useValue: {
            publishToQueue: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    dataSource = module.get<DataSource>(DataSource);
    ordersRepo = module.get<Repository<Order>>(getRepositoryToken(Order));
    usersRepo = module.get<Repository<User>>(getRepositoryToken(User));
    rabbitmqService = module.get(RabbitmqService);
    ordersEventsService = module.get(OrdersEventsService);

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
      },
    };

    jest
      .spyOn(dataSource, 'createQueryRunner')
      .mockReturnValue(queryRunner as never);
  });

  it('throws BadRequestException when items are empty', async () => {
    const dto = {
      userId: 'u1',
      items: [],
    };

    await expect(service.create(dto as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when user does not exist', async () => {
    const dto = {
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 1, priceSnapshot: 10 }],
    };

    jest.spyOn(usersRepo, 'findOne').mockResolvedValue(null);

    await expect(service.create(dto as never)).rejects.toThrow(
      NotFoundException,
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('returns existing order for repeated idempotency key', async () => {
    const existing = { id: 'o1', idempotencyKey: 'key-1' } as Order;

    jest.spyOn(ordersRepo, 'findOne').mockResolvedValue(existing);

    const dto = {
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 1, priceSnapshot: 10 }],
    };

    const result = await service.create(dto as never, 'key-1');

    expect(result).toEqual({ order: existing, wasDuplicate: true });
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(rabbitmqService.publishToQueue).not.toHaveBeenCalled();
  });

  it('locks product row, forces PENDING status, and publishes queue message on create', async () => {
    const dto = {
      userId: 'u1',
      status: OrderStatus.PAID,
      items: [{ productId: 'p1', quantity: 1, priceSnapshot: 10 }],
    };

    jest.spyOn(ordersRepo, 'findOne').mockResolvedValue(null);
    jest.spyOn(usersRepo, 'findOne').mockResolvedValue({ id: 'u1' } as User);

    const createdAt = new Date('2026-03-04T10:00:00.000Z');
    const product = { id: 'p1', stock: 5 } as Product;
    queryRunner.manager.findOne.mockImplementation(async (entity) => {
      if (entity === Product) {
        return product;
      }
      if (entity === Order) {
        return {
          id: 'o1',
          userId: 'u1',
          status: OrderStatus.PENDING,
          createdAt,
          items: [],
        } as Order;
      }
      return null;
    });

    queryRunner.manager.create.mockImplementation((entity, data) => {
      if (entity === Order) {
        return { id: 'o1', createdAt, ...data } as Order;
      }
      return { id: 'oi1', ...data };
    });
    queryRunner.manager.save.mockImplementation(async (entity, data) => data);

    const result = await service.create(dto as never, 'key-1');

    expect(queryRunner.manager.findOne).toHaveBeenCalledWith(Product, {
      where: { id: 'p1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      Product,
      expect.objectContaining({ stock: 4 }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(result.order.id).toBe('o1');
    expect(result.order.status).toBe(OrderStatus.PENDING);
    expect(result.wasDuplicate).toBe(false);
    expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
      'orders.process',
      expect.objectContaining({
        orderId: 'o1',
        createdAt: createdAt.toISOString(),
        attempt: 0,
        correlationId: 'o1',
        producer: 'orders-api',
        eventName: 'order.created',
      }),
      expect.objectContaining({
        correlationId: 'o1',
        timestamp: createdAt.getTime(),
      }),
    );
  });

  it('processOrderMessage: duplicate message_id exits without reprocessing', async () => {
    const message: OrderProcessMessage = {
      messageId: '11111111-1111-1111-1111-111111111111',
      orderId: '22222222-2222-2222-2222-222222222222',
      createdAt: '2026-03-04T10:00:00.000Z',
      attempt: 0,
    };

    jest.spyOn(dataSource, 'transaction').mockImplementation(async (callback: any) => {
      const manager = {
        insert: jest.fn().mockRejectedValue({ code: '23505' }),
      };
      return callback(manager);
    });

    await service.processOrderMessage(message);

    expect(ordersEventsService.publishStatusChanged).not.toHaveBeenCalled();
  });

  it('processOrderMessage: inserts processed marker and updates order once', async () => {
    const updatedAt = new Date('2026-03-04T10:00:05.000Z');
    const message: OrderProcessMessage = {
      messageId: '33333333-3333-3333-3333-333333333333',
      orderId: '44444444-4444-4444-4444-444444444444',
      createdAt: '2026-03-04T10:00:00.000Z',
      attempt: 0,
    };

    jest.spyOn(dataSource, 'transaction').mockImplementation(async (callback: any) => {
      const manager = {
        insert: jest.fn().mockResolvedValue(undefined),
        findOne: jest.fn().mockResolvedValue({
          id: message.orderId,
          status: OrderStatus.PENDING,
          processedAt: null,
        }),
        save: jest.fn().mockImplementation(async (_entity: any, order: any) => ({
          ...order,
          updatedAt,
        })),
      };
      return callback(manager);
    });

    await service.processOrderMessage(message);

    expect(ordersEventsService.publishStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: message.orderId,
        status: OrderStatus.PROCESSED,
        version: updatedAt.getTime(),
      }),
    );
  });
});
