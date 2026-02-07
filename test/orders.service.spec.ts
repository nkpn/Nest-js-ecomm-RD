import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../src/orders/entity/order.entity';
import { OrdersService } from '../src/orders/order.service';
import { User } from '../src/users/entity/user.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: Repository<Order>;
  let usersRepo: Repository<User>;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: DataSource,
          useValue: {
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
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    dataSource = module.get<DataSource>(DataSource);
    ordersRepo = module.get<Repository<Order>>(getRepositoryToken(Order));
    usersRepo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('throws BadRequestException when items are empty', async () => {
    jest.spyOn(dataSource, 'transaction').mockImplementation(async (cb) => cb({
      create: jest.fn(),
      save: jest.fn(),
    }) as never);

    const dto = {
      userId: 'u1',
      items: [],
    };

    await expect(service.create(dto as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    jest.spyOn(dataSource, 'transaction').mockImplementation(async (cb) => cb({
      create: jest.fn(),
      save: jest.fn(),
    }) as never);

    const dto = {
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 1, priceSnapshot: 10 }],
    };

    jest.spyOn(usersRepo, 'findOne').mockResolvedValue(null);

    await expect(service.create(dto as never)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns existing order for repeated idempotency key', async () => {
    const existing = { id: 'o1', idempotencyKey: 'key-1' } as Order;

    jest.spyOn(ordersRepo, 'findOne').mockResolvedValue(existing);
    const txSpy = jest
      .spyOn(dataSource, 'transaction')
      .mockImplementation(async (cb) => cb({} as never));

    const dto = {
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 1, priceSnapshot: 10 }],
    };

    const result = await service.create(dto as never, 'key-1');

    expect(result).toEqual(existing);
    expect(txSpy).not.toHaveBeenCalled();
  });
});
