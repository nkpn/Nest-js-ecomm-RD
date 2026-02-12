import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { OrderItem } from '../orders/entity/order-item.entity';
import { Product } from '../products/entity/product.entity';
import { ProductLoader } from './dataloaders/product.loader';

@Resolver(() => OrderItem)
export class OrderItemResolver {
  constructor(private readonly productLoader: ProductLoader) {}

  @ResolveField(() => Product)
  product(@Parent() item: OrderItem): Promise<Product | null> {
    return this.productLoader.load(item.productId);
  }
}
