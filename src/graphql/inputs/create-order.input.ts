import { Field, ID, InputType } from '@nestjs/graphql';
import { OrderStatus } from '../../orders/entity/order.entity';
import { OrderItemInput } from './order-item.input';

@InputType()
export class CreateOrderInput {
  @Field(() => ID)
  userId: string;

  @Field(() => OrderStatus, { nullable: true })
  status?: OrderStatus;

  @Field(() => [OrderItemInput])
  items: OrderItemInput[];
}
