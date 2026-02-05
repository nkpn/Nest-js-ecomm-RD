import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemsRepo: Repository<OrderItem>,
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    const items = dto.items?.map((item) => this.itemsRepo.create(item)) ?? [];
    const order = this.ordersRepo.create({ ...dto, items });
    return this.ordersRepo.save(order);
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
}
