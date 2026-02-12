import { Field, InputType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../../orders/entity/order.entity';

@InputType()
export class OrdersFilterInput {
  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
