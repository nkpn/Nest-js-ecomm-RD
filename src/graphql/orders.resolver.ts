import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CreateOrderInput } from './inputs/create-order.input';
import { OrdersFilterInput } from './inputs/orders-filter.input';
import { OrdersPaginationInput } from './inputs/orders-pagination.input';
import { Order } from '../orders/entity/order.entity';
import { OrdersConnection } from './types/orders-connection.type';
import { OrdersService } from '../orders/order.service';

@Resolver(() => Order)
export class OrdersResolver {
  constructor(private readonly ordersService: OrdersService) {}

  @Query(() => OrdersConnection)
  orders(
    @Args('filter', { nullable: true }) filter?: OrdersFilterInput,
    @Args('pagination', { nullable: true }) pagination?: OrdersPaginationInput,
  ): Promise<OrdersConnection> {
    return this.ordersService.getAllConnection(filter, pagination);
  }

  @Mutation(() => Order)
  createOrder(
    @Args('input') input: CreateOrderInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<Order> {
    return this.ordersService.createFromInput(input, idempotencyKey);
  }
}
