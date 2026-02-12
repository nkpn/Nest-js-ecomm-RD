import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Order } from './order.entity';
import { Product } from '../../products/entity/product.entity';

@ObjectType()
@Entity('order_items')
@Index('IDX_order_items_order_id', ['orderId'])
@Index('IDX_order_items_product_id', ['productId'])
export class OrderItem {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Field(() => ID)
  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @Field(() => Product)
  @ManyToOne(() => Product, (product) => product.orderItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Field(() => Int)
  @Column({ type: 'int' })
  quantity: number;

  @Field(() => String)
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    name: 'price_snapshot',
  })
  priceSnapshot: number;

  @Field()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
