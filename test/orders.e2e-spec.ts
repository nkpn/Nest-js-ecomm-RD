import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { OrderItem } from '../src/orders/entity/order-item.entity';
import { Order } from '../src/orders/entity/order.entity';
import { Product } from '../src/products/entity/product.entity';
import { User } from '../src/users/entity/user.entity';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const createUser = async (): Promise<User> => {
    const repo = dataSource.getRepository(User);
    return repo.save(repo.create({ email: `u_${randomUUID()}@test.com` }));
  };

  const createProduct = async (stock: number): Promise<Product> => {
    const repo = dataSource.getRepository(Product);
    return repo.save(
      repo.create({
        name: `p_${randomUUID()}`,
        sku: `sku_${randomUUID()}`,
        description: null,
        price: 10,
        stock,
        isActive: true,
      }),
    );
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    // Clean DB to avoid cross-test interference
    await dataSource.query(
      'TRUNCATE TABLE order_items, orders, products, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  it('idempotency: same key returns same order (201 then 200)', async () => {
    const user = await createUser();
    const product = await createProduct(5);
    const key = randomUUID();

    const payload = {
      userId: user.id,
      items: [{ productId: product.id, quantity: 1, priceSnapshot: 10 }],
    };

    const first = await request(app.getHttpServer())
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/orders')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);

    expect(second.body.id).toBe(first.body.id);

    const count = await dataSource
      .getRepository(Order)
      .count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it('no partial writes: failure leaves no order/items', async () => {
    const user = await createUser();
    const product = await createProduct(0);

    const payload = {
      userId: user.id,
      items: [{ productId: product.id, quantity: 1, priceSnapshot: 10 }],
    };

    await request(app.getHttpServer())
      .post('/orders')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(409);

    const ordersCount = await dataSource.getRepository(Order).count();
    const itemsCount = await dataSource.getRepository(OrderItem).count();
    expect(ordersCount).toBe(0);
    expect(itemsCount).toBe(0);
  });

  it('oversell: two parallel orders, only one succeeds', async () => {
    const user = await createUser();
    const product = await createProduct(1);

    const payload = {
      userId: user.id,
      items: [{ productId: product.id, quantity: 1, priceSnapshot: 10 }],
    };

    const [r1, r2] = await Promise.allSettled([
      request(app.getHttpServer())
        .post('/orders')
        .set('Idempotency-Key', randomUUID())
        .send(payload),
      request(app.getHttpServer())
        .post('/orders')
        .set('Idempotency-Key', randomUUID())
        .send(payload),
    ]);

    const statuses = [r1, r2].map((r) =>
      r.status === 'fulfilled' ? r.value.status : 500,
    );

    expect(statuses.sort()).toEqual([201, 409]);

    const itemsCount = await dataSource
      .getRepository(OrderItem)
      .count({ where: { productId: product.id } });
    expect(itemsCount).toBe(1);
  });
});
