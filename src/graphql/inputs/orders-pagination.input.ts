import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Min } from 'class-validator';

@InputType()
export class OrdersPaginationInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
