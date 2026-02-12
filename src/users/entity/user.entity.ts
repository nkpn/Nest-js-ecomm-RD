import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { Order } from '../../orders/entity/order.entity';

@ObjectType()
@Entity('users')
@Index('IDX_users_email_unique', ['email'], { unique: true })
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Field(() => [Order])
  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
