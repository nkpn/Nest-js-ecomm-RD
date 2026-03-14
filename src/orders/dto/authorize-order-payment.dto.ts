import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class AuthorizeOrderPaymentDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter uppercase code (e.g. USD)',
  })
  currency: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  simulateUnavailableOnce?: boolean;
}
