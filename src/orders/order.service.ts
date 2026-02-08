import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from '../products/entity/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entity/order.entity';
import { OrderItem } from './entity/order-item.entity';
import { User } from '../users/entity/user.entity';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<{ order: Order; wasDuplicate: boolean }> {
    // 1) Idempotency: return existing order for the same key
    const key = idempotencyKey ?? dto.idempotencyKey ?? null;
    if (key) {
      const existingOrder = await this.ordersRepo.findOne({
        where: { idempotencyKey: key },
        relations: ['items'],
      });
      if (existingOrder) {
        return { order: existingOrder, wasDuplicate: true };
      }
    }

    // 2) Validate items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order items cannot be empty');
    }

    // 3) Validate user exists
    const user = await this.usersRepo.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 4) Transaction: order + items + stock updates atomically at the same time
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = queryRunner.manager.create(Order, {
        userId: dto.userId,
        status: dto.status,
        idempotencyKey: key,
      });
      const savedOrder = await queryRunner.manager.save(Order, order);

      const savedItems: OrderItem[] = [];
      for (const item of dto.items) {
        const product = await queryRunner.manager.findOne(Product, {
          where: { id: item.productId },
          lock: { mode: 'pessimistic_write' }, // Oversell protection
        });
        if (!product) {
          throw new NotFoundException('Product not found');
        }
        if (item.quantity <= 0) {
          throw new BadRequestException('Quantity must be greater than zero');
        }
        if (product.stock < item.quantity) {
          throw new ConflictException('Insufficient stock');
        }

        product.stock -= item.quantity;
        await queryRunner.manager.save(Product, product);

        const orderItem = queryRunner.manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          priceSnapshot: item.priceSnapshot,
        });
        const savedItem = await queryRunner.manager.save(OrderItem, orderItem);
        savedItems.push(savedItem);
      }

      savedOrder.items = savedItems;

      await queryRunner.commitTransaction();
      return { order: savedOrder, wasDuplicate: false };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (this.isUniqueViolation(error) && key) {
        const existingOrder = await this.ordersRepo.findOne({
          where: { idempotencyKey: key },
          relations: ['items'],
        });
        if (existingOrder) {
          return { order: existingOrder, wasDuplicate: true };
        }
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getAll(): Promise<Order[]> {
    return this.ordersRepo.find({ relations: ['items'] });
  }

  async getOrder(id: Order['id']): Promise<Order> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async updateOrder(id: Order['id'], updates: UpdateOrderDto): Promise<Order> {
    const order = await this.ordersRepo.preload({ id, ...updates });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.ordersRepo.save(order);
  }

  async deleteOrder(id: Order['id']): Promise<void> {
    const result = await this.ordersRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Order not found');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
