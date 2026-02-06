import { OrderStatus } from '../entity/order.entity';

export class UpdateOrderDto {
  status?: OrderStatus;
  idempotencyKey?: string | null;
}
