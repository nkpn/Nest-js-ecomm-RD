import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

  async create(dto: CreateOrderDto, idempotencyKey?: string): Promise<Order> {
    const key = idempotencyKey ?? dto.idempotencyKey ?? null;
    if (key) {
      const existingOrder = await this.ordersRepo.findOne({
        where: { idempotencyKey: key },
        relations: ['items'],
      });
      if (existingOrder) {
        return existingOrder;
      }
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order items cannot be empty');
    }

    const user = await this.usersRepo.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const items =
          dto.items?.map((item) => manager.create(OrderItem, item)) ?? [];
        const order = manager.create(Order, {
          ...dto,
          idempotencyKey: key,
          items,
        });
        return manager.save(Order, order);
      });
    } catch (error) {
      if (this.isUniqueViolation(error) && key) {
        const existingOrder = await this.ordersRepo.findOne({
          where: { idempotencyKey: key },
          relations: ['items'],
        });
        if (existingOrder) {
          return existingOrder;
        }
      }
      throw error;
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
