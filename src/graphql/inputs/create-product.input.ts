import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateProductInput {
  @Field()
  name: string;

  @Field()
  sku: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String)
  price: string;

  @Field(() => Int, { nullable: true })
  stock?: number;

  @Field({ nullable: true })
  isActive?: boolean;
}
