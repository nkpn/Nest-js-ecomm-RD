import { IsIn, IsString, IsUUID, ValidateIf } from 'class-validator';

export class CompleteUploadDto {
  @IsUUID()
  fileId: string;

  @IsString()
  @IsIn(['avatar', 'product-image'])
  bindTo: 'avatar' | 'product-image';

  @ValidateIf((dto: CompleteUploadDto) => dto.bindTo === 'product-image')
  @IsUUID()
  productId?: string;
}
