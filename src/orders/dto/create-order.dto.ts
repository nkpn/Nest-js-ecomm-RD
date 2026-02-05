import { OrderStatus } from '../order.entity';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  userId: string;
  status?: OrderStatus;
  idempotencyKey?: string | null;
  items: CreateOrderItemDto[];
}
