import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entity/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productsRepo.create(dto);
    return this.productsRepo.save(product);
  }

  async getAll(): Promise<Product[]> {
    return this.productsRepo.find();
  }

  async getProduct(id: Product['id']): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async updateProduct(
    id: Product['id'],
    updates: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.productsRepo.preload({ id, ...updates });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.productsRepo.save(product);
  }

  async deleteProduct(id: Product['id']): Promise<void> {
    const result = await this.productsRepo.delete({ id });
    if (!result.affected) {
      throw new NotFoundException('Product not found');
    }
  }
}
