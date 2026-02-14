import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileRecord } from './file-record.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { S3Service } from './s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecord])],
  controllers: [FilesController],
  providers: [FilesService, S3Service],
  exports: [FilesService, TypeOrmModule]
})
export class FilesModule {}
