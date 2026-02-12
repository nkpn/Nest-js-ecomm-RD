import DataLoader, { type BatchLoadFn } from 'dataloader';
import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../../products/entity/product.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProductLoader {
  private readonly loader: DataLoader<string, Product | null>;

  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {
    const batchLoad: BatchLoadFn<string, Product | null> = async (ids) => {
      const idList = Array.from(ids);
      const products = await this.productsRepo.find({
        where: { id: In(idList) },
      });
      const map = new Map(products.map((p) => [p.id, p]));
      return idList.map((id) => map.get(id) ?? null);
    };

    this.loader = new DataLoader<string, Product | null>(batchLoad);
  }

  load(id: string): Promise<Product | null> {
    return this.loader.load(id);
  }
}
