import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { User } from '../../users/entity/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  CREATED = 'CREATED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

registerEnumType(OrderStatus, { name: 'OrderStatus' });

@ObjectType()
@Entity('orders')
@Index('IDX_orders_user_id', ['userId'])
@Index('IDX_orders_created_at', ['createdAt'])
@Index('IDX_orders_idempotency_key_unique', ['idempotencyKey'], {
  unique: true,
})
export class Order {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Field(() => User)
  user: User;

  @Field(() => [OrderItem])
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @Field(() => OrderStatus)
  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'orders_status_enum',
    default: OrderStatus.CREATED,
  })
  status: OrderStatus;

  @Field(() => String, { nullable: true })
  @Column({
    type: 'varchar',
    length: 120,
    name: 'idempotency_key',
    nullable: true,
  })
  idempotencyKey: string | null;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
