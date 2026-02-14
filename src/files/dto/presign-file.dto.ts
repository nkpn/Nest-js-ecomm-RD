import { IsIn, IsInt, IsString, Min } from 'class-validator';

export class PresignFileDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;

  @IsString()
  @IsIn(['avatar', 'product-image'])
  kind: 'avatar' | 'product-image';
}
