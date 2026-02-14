import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/types';
import { FileRecord, FileStatus } from './file-record.entity';
import { PresignFileDto } from './dto/presign-file.dto';
import { S3Service } from './s3.service';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

@Injectable()
export class FilesService {
  private readonly maxImageBytes = 5 * 1024 * 1024;

  constructor(
    @InjectRepository(FileRecord)
    private readonly filesRepository: Repository<FileRecord>,
    private readonly s3Service: S3Service
  ) {}

  async createPresignedUpload(user: AuthUser, dto: PresignFileDto) {
    this.validateUploadInput(dto);

    const objectKey = this.buildObjectKey(dto.kind, user.sub, dto.contentType);

    const file = this.filesRepository.create({
      ownerUserId: user.sub,
      objectKey,
      bucket: this.s3Service.getBucketName(),
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      status: FileStatus.PENDING,
      completedAt: null
    });

    const saved = await this.filesRepository.save(file);
    const presigned = await this.s3Service.presignPutObject({
      key: saved.objectKey,
      contentType: saved.contentType,
      sizeBytes: saved.sizeBytes
    });

    return {
      fileId: saved.id,
      status: saved.status,
      objectKey: saved.objectKey,
      uploadUrl: presigned.uploadUrl,
      uploadMethod: 'PUT',
      uploadHeaders: {
        'Content-Type': saved.contentType
      },
      expiresInSec: presigned.expiresInSec,
      publicUrl: this.s3Service.buildPublicUrl(saved.objectKey)
    };
  }

  async completeUpload(fileId: string, user: AuthUser) {
    const file = await this.findByIdOrThrow(fileId);
    this.assertOwnerOrStaff(file, user);

    if (file.status === FileStatus.READY) {
      return this.toPublicView(file);
    }

    const exists = await this.s3Service.objectExists(file.objectKey);
    if (!exists) {
      throw new BadRequestException('File object is missing in storage');
    }

    file.status = FileStatus.READY;
    file.completedAt = new Date();
    const saved = await this.filesRepository.save(file);

    return this.toPublicView(saved);
  }

  async getFileById(fileId: string, user: AuthUser) {
    const file = await this.findByIdOrThrow(fileId);
    this.assertOwnerOrStaff(file, user);
    return this.toPublicView(file);
  }

  async getReadyOwnedFile(fileId: string, ownerUserId: string): Promise<FileRecord> {
    const file = await this.findByIdOrThrow(fileId);

    if (file.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('You can use only your own uploaded files');
    }

    if (file.status !== FileStatus.READY) {
      throw new BadRequestException('File upload is not completed');
    }

    return file;
  }

  async getReadyFileForProduct(fileId: string, user: AuthUser): Promise<FileRecord> {
    const file = await this.findByIdOrThrow(fileId);

    if (file.status !== FileStatus.READY) {
      throw new BadRequestException('File upload is not completed');
    }

    if (file.ownerUserId === user.sub) {
      return file;
    }

    const canUseAny = user.roles.includes('admin') || user.scopes.includes('products:images:assign:any');
    if (!canUseAny) {
      throw new ForbiddenException('Cannot attach another user file');
    }

    return file;
  }

  buildPublicUrl(objectKey: string): string {
    return this.s3Service.buildPublicUrl(objectKey);
  }

  private async findByIdOrThrow(fileId: string): Promise<FileRecord> {
    const file = await this.filesRepository.findOne({
      where: { id: fileId }
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  private validateUploadInput(dto: PresignFileDto): void {
    if (!ALLOWED_CONTENT_TYPES.includes(dto.contentType as any)) {
      throw new BadRequestException(
        `Unsupported contentType. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`
      );
    }

    if (!Number.isInteger(dto.sizeBytes) || dto.sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be a positive integer');
    }

    if (dto.sizeBytes > this.maxImageBytes) {
      throw new BadRequestException(`Max file size is ${this.maxImageBytes} bytes`);
    }

    if (dto.kind !== 'avatar' && dto.kind !== 'product-image') {
      throw new BadRequestException('Unsupported kind');
    }
  }

  private assertOwnerOrStaff(file: FileRecord, user: AuthUser): void {
    const isOwner = file.ownerUserId === user.sub;
    const isStaff = user.roles.includes('admin') || user.roles.includes('support');

    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Access denied');
    }
  }

  private buildObjectKey(kind: string, userId: string, contentType: string): string {
    const ext = EXTENSION_BY_TYPE[contentType] ?? 'bin';
    return `${kind}/${userId}/${Date.now()}-${randomUUID()}.${ext}`;
  }

  private toPublicView(file: FileRecord) {
    return {
      id: file.id,
      ownerUserId: file.ownerUserId,
      status: file.status,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      objectKey: file.objectKey,
      bucket: file.bucket,
      completedAt: file.completedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      publicUrl: this.s3Service.buildPublicUrl(file.objectKey)
    };
  }
}
