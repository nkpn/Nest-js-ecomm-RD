import { In } from 'typeorm';
import dataSource from '../../data-source';
import { Order } from '../orders/entity/order.entity';
import { OrderItem } from '../orders/entity/order-item.entity';
import { Product } from '../products/entity/product.entity';
import { User } from '../users/entity/user.entity';

const usersSeed = [
  { email: 'alice@example.com' },
  { email: 'bob@example.com' },
  { email: 'charlie@example.com' },
];

const productNames = [
  'Coffee Mug',
  'Notebook',
  'Desk Lamp',
  'Mechanical Keyboard',
  'Wireless Mouse',
  'USB-C Cable',
  'Webcam',
  'Laptop Stand',
  'Monitor 24"',
  'Monitor 27"',
  'Headphones',
  'Microphone',
  'Backpack',
  'Water Bottle',
  'Sticker Pack',
  'T-Shirt',
  'Hoodie',
  'Pen Set',
  'Mouse Pad',
  'External SSD',
  'Power Bank',
  'Smart Plug',
  'Smart Bulb',
  'Router',
  'Keyboard Wrist Rest',
];

const makeSku = (name: string, index: number): string => {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `SKU-${String(index + 1).padStart(3, '0')}-${base}`;
};

const productsSeed = productNames.map((name, index) => {
  const basePrice = 5 + index * 3;
  const lowStock = index % 5 === 0;
  return {
    name,
    sku: makeSku(name, index),
    description: null,
    price: Number((basePrice + 0.99).toFixed(2)),
    isActive: true,
    stock: lowStock ? 2 : 20,
  };
});

const ordersSeed = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    userEmail: 'alice@example.com',
    items: [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        productName: 'Coffee Mug',
        quantity: 1,
      },
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
        productName: 'Mechanical Keyboard',
        quantity: 1,
      },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    userEmail: 'bob@example.com',
    items: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        productName: 'Notebook',
        quantity: 2,
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
        productName: 'Wireless Mouse',
        quantity: 1,
      },
    ],
  },
];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seeding is disabled in production');
  }

  await dataSource.initialize();

  try {
    const usersRepository = dataSource.getRepository(User);
    const productsRepository = dataSource.getRepository(Product);
    const ordersRepository = dataSource.getRepository(Order);
    const orderItemsRepository = dataSource.getRepository(OrderItem);

    await usersRepository.upsert(usersSeed, ['email']);
    await productsRepository.upsert(productsSeed, ['sku']);

    const users = await usersRepository.find({
      where: { email: In(usersSeed.map((user) => user.email)) },
    });
    const usersByEmail = new Map(users.map((user) => [user.email, user]));

    const products = await productsRepository.find({
      where: { name: In(productNames) },
    });
    const productsByName = new Map(
      products.map((product) => [product.name, product]),
    );

    const ordersToUpsert: Array<Partial<Order>> = [];
    const orderItemsToUpsert: Array<Partial<OrderItem>> = [];

    for (const orderSeed of ordersSeed) {
      const user = usersByEmail.get(orderSeed.userEmail);
      if (!user) {
        continue;
      }

      ordersToUpsert.push({
        id: orderSeed.id,
        userId: user.id,
      });

      for (const item of orderSeed.items) {
        const product = productsByName.get(item.productName);
        if (!product) {
          throw new Error(`Missing product: ${item.productName}`);
        }

        orderItemsToUpsert.push({
          id: item.id,
          orderId: orderSeed.id,
          productId: product.id,
          quantity: item.quantity,
          priceSnapshot: Number(product.price),
        });
      }
    }

    if (ordersToUpsert.length > 0) {
      await ordersRepository.upsert(ordersToUpsert, ['id']);
    }

    if (orderItemsToUpsert.length > 0) {
      await orderItemsRepository.upsert(orderItemsToUpsert, ['id']);
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
