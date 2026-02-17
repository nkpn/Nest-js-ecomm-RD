import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

export enum FileStatus {
  PENDING = 'pending',
  READY = 'ready'
}

export enum FileVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public'
}

@Entity('files')
@Index('IDX_files_owner_id', ['ownerId'])
@Index('IDX_files_entity_id', ['entityId'])
@Index('IDX_files_status', ['status'])
@Index('IDX_files_visibility', ['visibility'])
@Index('UQ_files_key', ['key'], { unique: true })
export class FileRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @Column({ type: 'uuid', name: 'entity_id', nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 512, name: 'key' })
  key: string;

  @Column({ type: 'varchar', length: 120, name: 'content_type' })
  contentType: string;

  @Column({ type: 'integer', name: 'size' })
  size: number;

  @Column({
    type: 'enum',
    enum: FileStatus,
    default: FileStatus.PENDING
  })
  status: FileStatus;

  @Column({
    type: 'enum',
    enum: FileVisibility,
    default: FileVisibility.PRIVATE
  })
  visibility: FileVisibility;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
