import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entity/product.entity';
import { ProductsService } from './product.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  getAll(): Promise<Product[]> {
    return this.productsService.getAll();
  }

  @Get(':id')
  getProduct(@Param('id') id: string): Promise<Product> {
    return this.productsService.getProduct(id);
  }

  @Post()
  create(@Body() body: CreateProductDto): Promise<Product> {
    return this.productsService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.updateProduct(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.productsService.deleteProduct(id);
  }
}
