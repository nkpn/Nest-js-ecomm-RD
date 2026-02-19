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
import { Product } from '../products/entity/product.entity';
import { User } from '../users/entity/user.entity';
import { CompleteUploadDto } from './dto/complete-upload.dto';
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
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly s3Service: S3Service,
  ) {}

  async createPresignedUpload(user: AuthUser, dto: PresignFileDto) {
    this.assertCanPresign(user, dto.kind);
    await this.validateUploadInput(dto);

    const key = this.buildObjectKey(
      dto.kind,
      user.sub,
      dto.contentType,
      dto.productId,
    );

    const file = this.filesRepository.create({
      ownerId: user.sub,
      entityId: dto.kind === 'product-image' ? dto.productId! : null,
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
      key: saved.key,
      uploadUrl: presigned.uploadUrl,
      contentType: saved.contentType,
      publicUrl: this.s3Service.buildPublicUrl(saved.key),
      uploadMethod: 'PUT',
      expiresInSec: presigned.expiresInSec,
    };
  }

  async completeUpload(dto: CompleteUploadDto, user: AuthUser) {
    const file = await this.findByIdOrThrow(dto.fileId);
    this.assertOwner(file, user);

    if (file.status === FileStatus.PENDING) {
      const exists = await this.s3Service.objectExists(file.key);
      if (!exists) {
        throw new BadRequestException('File object is missing in storage');
      }
      file.status = FileStatus.READY;
    }

    await this.attachFileToDomain(dto, file, user);
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

  private async validateUploadInput(dto: PresignFileDto): Promise<void> {
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

    if (dto.kind === 'avatar' && dto.productId) {
      throw new BadRequestException('productId is not allowed for avatar uploads');
    }

    if (dto.kind === 'product-image') {
      if (!dto.productId) {
        throw new BadRequestException(
          'productId is required for product-image uploads',
        );
      }

      const productExists = await this.productsRepository.exist({
        where: { id: dto.productId },
      });

      if (!productExists) {
        throw new NotFoundException('Product not found');
      }
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

  private assertOwner(file: FileRecord, user: AuthUser): void {
    if (file.ownerId !== user.sub) {
      throw new ForbiddenException('File does not belong to current user');
    }
  }

  private assertCanPresign(
    user: AuthUser,
    kind: PresignFileDto['kind'],
  ): void {
    const allowedRoles = ['user', 'support', 'admin'];
    const hasAllowedRole = user.roles.some((role) => allowedRoles.includes(role));
    if (!hasAllowedRole) {
      throw new ForbiddenException('Role is not allowed to upload files');
    }

    if (user.roles.includes('admin')) {
      return;
    }

    const hasRequiredScope =
      user.scopes.includes('files:write') ||
      (kind === 'product-image' && user.scopes.includes('products:images:write'));

    if (!hasRequiredScope) {
      throw new ForbiddenException('Insufficient scope for file upload');
    }
  }

  private buildObjectKey(
    kind: string,
    userId: string,
    contentType: string,
    productId?: string,
  ): string {
    const ext = EXTENSION_BY_TYPE[contentType] ?? 'bin';
    const fileId = randomUUID();

    if (kind === 'avatar') {
      return `users/${userId}/avatars/${fileId}.${ext}`;
    }

    if (!productId) {
      throw new BadRequestException(
        'productId is required for product-image uploads',
      );
    }

    return `products/${productId}/images/${fileId}.${ext}`;
  }

  private async attachFileToDomain(
    dto: CompleteUploadDto,
    file: FileRecord,
    user: AuthUser,
  ): Promise<void> {
    if (dto.bindTo === 'avatar') {
      this.assertAvatarKeyBelongsToOwner(file.key, user.sub);
      file.entityId = user.sub;

      const result = await this.usersRepository.update(
        { id: user.sub },
        { avatarFileId: file.id },
      );

      if (!result.affected) {
        throw new NotFoundException('User not found');
      }

      return;
    }

    if (!dto.productId) {
      throw new BadRequestException(
        'productId is required for product-image binding',
      );
    }

    this.assertProductKeyMatchesTarget(file.key, dto.productId);
    file.entityId = dto.productId;

    const result = await this.productsRepository.update(
      { id: dto.productId },
      { imageFileId: file.id },
    );

    if (!result.affected) {
      throw new NotFoundException('Product not found');
    }
  }

  private assertAvatarKeyBelongsToOwner(key: string, userId: string): void {
    const expectedPrefix = `users/${userId}/avatars/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new BadRequestException('File key does not match avatar binding');
    }
  }

  private assertProductKeyMatchesTarget(key: string, productId: string): void {
    const expectedPrefix = `products/${productId}/images/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'File key does not match product-image binding',
      );
    }
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
