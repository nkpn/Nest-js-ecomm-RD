import { Field, ID, InputType } from '@nestjs/graphql';
import { OrderItemInput } from './order-item.input';

@InputType()
export class CreateOrderInput {
  @Field(() => ID)
  userId: string;

  @Field(() => [OrderItemInput])
  items: OrderItemInput[];
}
