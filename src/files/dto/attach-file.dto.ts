import { IsUUID } from 'class-validator';

export class AttachFileDto {
  @IsUUID()
  fileId: string;
}
