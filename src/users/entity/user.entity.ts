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
@Index('IDX_users_avatar_file_id', ['avatarFileId'])
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
    nullable: true,
    select: false,
  })
  passwordHash?: string | null;

  @Field(() => [String])
  @Column({
    type: 'text',
    array: true,
    default: () => 'ARRAY[]::text[]',
  })
  roles: string[];

  @Field(() => [String])
  @Column({
    type: 'text',
    array: true,
    default: () => 'ARRAY[]::text[]',
  })
  scopes: string[];

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', name: 'avatar_file_id', nullable: true })
  avatarFileId: string | null;

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
