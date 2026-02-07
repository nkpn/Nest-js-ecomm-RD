import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Order } from './src/orders/entity/order.entity';
import { OrderItem } from './src/orders/entity/order-item.entity';
import { Product } from './src/products/entity/product.entity';
import { User } from './src/users/entity/user.entity';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1234,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  entities: [User, Product, Order, OrderItem],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

export default dataSource;
