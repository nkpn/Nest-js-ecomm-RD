import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/types';
import { FileRecord, FileStatus, FileVisibility } from './file-record.entity';
import { PresignFileDto } from './dto/presign-file.dto';
import { S3Service } from './s3.service';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class FilesService {
  private readonly maxImageBytes = 5 * 1024 * 1024;

  constructor(
    @InjectRepository(FileRecord)
    private readonly filesRepository: Repository<FileRecord>,
    private readonly s3Service: S3Service,
  ) {}

  async createPresignedUpload(user: AuthUser, dto: PresignFileDto) {
    this.validateUploadInput(dto);

    const key = this.buildObjectKey(dto.kind, user.sub, dto.contentType);

    const file = this.filesRepository.create({
      ownerId: user.sub,
      entityId: null,
      key,
      contentType: dto.contentType,
      size: dto.sizeBytes,
      status: FileStatus.PENDING,
      visibility: FileVisibility.PRIVATE,
    });

    const saved = await this.filesRepository.save(file);
    const presigned = await this.s3Service.presignPutObject({
      key: saved.key,
      contentType: saved.contentType,
      sizeBytes: saved.size,
    });

    return {
      fileId: saved.id,
      status: saved.status,
      key: saved.key,
      ownerId: saved.ownerId,
      entityId: saved.entityId,
      visibility: saved.visibility,
      uploadUrl: presigned.uploadUrl,
      uploadMethod: 'PUT',
      uploadHeaders: {
        'Content-Type': saved.contentType,
      },
      expiresInSec: presigned.expiresInSec,
      publicUrl: this.s3Service.buildPublicUrl(saved.key),
    };
  }

  async completeUpload(fileId: string, user: AuthUser) {
    const file = await this.findByIdOrThrow(fileId);
    this.assertOwnerOrStaff(file, user);

    if (file.status === FileStatus.READY) {
      return this.toPublicView(file);
    }

    const exists = await this.s3Service.objectExists(file.key);
    if (!exists) {
      throw new BadRequestException('File object is missing in storage');
    }

    file.status = FileStatus.READY;
    const saved = await this.filesRepository.save(file);

    return this.toPublicView(saved);
  }

  async getFileById(fileId: string, user: AuthUser) {
    const file = await this.findByIdOrThrow(fileId);
    this.assertOwnerOrStaff(file, user);
    return this.toPublicView(file);
  }

  async getReadyOwnedFile(
    fileId: string,
    ownerId: string,
  ): Promise<FileRecord> {
    const file = await this.findByIdOrThrow(fileId);

    if (file.ownerId !== ownerId) {
      throw new ForbiddenException('You can use only your own uploaded files');
    }

    if (file.status !== FileStatus.READY) {
      throw new BadRequestException('File upload is not completed');
    }

    return file;
  }

  async getReadyFileForProduct(
    fileId: string,
    user: AuthUser,
  ): Promise<FileRecord> {
    const file = await this.findByIdOrThrow(fileId);

    if (file.status !== FileStatus.READY) {
      throw new BadRequestException('File upload is not completed');
    }

    if (file.ownerId === user.sub) {
      return file;
    }

    const canUseAny =
      user.roles.includes('admin') ||
      user.scopes.includes('products:images:assign:any');
    if (!canUseAny) {
      throw new ForbiddenException('Cannot attach another user file');
    }

    return file;
  }

  buildPublicUrl(key: string): string {
    return this.s3Service.buildPublicUrl(key);
  }

  private async findByIdOrThrow(fileId: string): Promise<FileRecord> {
    const file = await this.filesRepository.findOne({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  private validateUploadInput(dto: PresignFileDto): void {
    if (!ALLOWED_CONTENT_TYPES.includes(dto.contentType as any)) {
      throw new BadRequestException(
        `Unsupported contentType. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }

    if (!Number.isInteger(dto.sizeBytes) || dto.sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be a positive integer');
    }

    if (dto.sizeBytes > this.maxImageBytes) {
      throw new BadRequestException(
        `Max file size is ${this.maxImageBytes} bytes`,
      );
    }

    if (dto.kind !== 'avatar' && dto.kind !== 'product-image') {
      throw new BadRequestException('Unsupported kind');
    }
  }

  private assertOwnerOrStaff(file: FileRecord, user: AuthUser): void {
    const isOwner = file.ownerId === user.sub;
    const isStaff =
      user.roles.includes('admin') || user.roles.includes('support');

    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Access denied');
    }
  }

  private buildObjectKey(
    kind: string,
    userId: string,
    contentType: string,
  ): string {
    const ext = EXTENSION_BY_TYPE[contentType] ?? 'bin';
    return `${kind}/${userId}/${Date.now()}-${randomUUID()}.${ext}`;
  }

  private toPublicView(file: FileRecord) {
    return {
      id: file.id,
      ownerId: file.ownerId,
      entityId: file.entityId,
      status: file.status,
      visibility: file.visibility,
      contentType: file.contentType,
      size: file.size,
      key: file.key,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      publicUrl: this.s3Service.buildPublicUrl(file.key),
    };
  }
}
