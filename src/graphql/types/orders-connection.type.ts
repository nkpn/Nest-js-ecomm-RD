import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Order } from '../../orders/entity/order.entity';
import { PageInfo } from './page-info.type';

@ObjectType()
export class OrdersConnection {
  @Field(() => [Order])
  nodes: Order[];

  @Field(() => Int)
  totalCount: number;

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
