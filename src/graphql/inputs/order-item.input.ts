import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType()
export class OrderItemInput {
  @Field(() => ID)
  productId: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => String)
  priceSnapshot: string;
}
