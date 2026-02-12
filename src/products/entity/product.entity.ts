import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { OrderItem } from '../../orders/entity/order-item.entity';

@ObjectType()
@Entity('products')
@Index('IDX_products_sku_unique', ['sku'], { unique: true })
@Index('IDX_products_created_at', ['createdAt'])
export class Product {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 64 })
  sku: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => Float)
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  stock: number;

  @Field()
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @Field(() => [OrderItem])
  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  orderItems: OrderItem[];
}
