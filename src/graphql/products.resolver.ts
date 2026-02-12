import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Product } from '../products/entity/product.entity';
import { ProductsService } from '../products/product.service';
import { CreateProductInput } from './inputs/create-product.input';
import { OrdersPaginationInput } from './inputs/orders-pagination.input';

@Resolver(() => Product)
export class ProductsResolver {
  constructor(private readonly productsService: ProductsService) {}

  @Query(() => [Product])
  products(
    @Args('pagination', { nullable: true }) pagination?: OrdersPaginationInput,
  ): Promise<Product[]> {
    return this.productsService.getAllPaginated(pagination);
  }

  @Mutation(() => Product)
  createProduct(@Args('input') input: CreateProductInput): Promise<Product> {
    return this.productsService.createFromInput(input);
  }
}
