import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../src/orders/entity/order.entity';
import { OrdersService } from '../src/orders/order.service';
import { Product } from '../src/products/entity/product.entity';
import { User } from '../src/users/entity/user.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: Repository<Order>;
  let usersRepo: Repository<User>;
  let dataSource: DataSource;
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
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    dataSource = module.get<DataSource>(DataSource);
    ordersRepo = module.get<Repository<Order>>(getRepositoryToken(Order));
    usersRepo = module.get<Repository<User>>(getRepositoryToken(User));

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
  });

  it('locks product row and decreases stock on create', async () => {
    const dto = {
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 1, priceSnapshot: 10 }],
    };

    jest.spyOn(ordersRepo, 'findOne').mockResolvedValue(null);
    jest.spyOn(usersRepo, 'findOne').mockResolvedValue({ id: 'u1' } as User);

    const product = { id: 'p1', stock: 5 } as Product;
    queryRunner.manager.findOne.mockResolvedValue(product);

    queryRunner.manager.create.mockImplementation((entity, data) => {
      if (entity === Order) {
        return { id: 'o1', ...data } as Order;
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
    expect(result.wasDuplicate).toBe(false);
  });
});
