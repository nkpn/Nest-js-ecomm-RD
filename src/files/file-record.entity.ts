import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { User } from '../users/entity/user.entity';

export enum FileStatus {
  PENDING = 'pending',
  READY = 'ready'
}

@Entity('files')
@Index('IDX_files_owner_user_id', ['ownerUserId'])
@Index('IDX_files_status', ['status'])
@Index('UQ_files_object_key', ['objectKey'], { unique: true })
export class FileRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'owner_user_id' })
  ownerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: User;

  @Column({ type: 'varchar', length: 512, name: 'object_key' })
  objectKey: string;

  @Column({ type: 'varchar', length: 120 })
  bucket: string;

  @Column({ type: 'varchar', length: 120, name: 'content_type' })
  contentType: string;

  @Column({ type: 'integer', name: 'size_bytes' })
  sizeBytes: number;

  @Column({
    type: 'enum',
    enum: FileStatus,
    default: FileStatus.PENDING
  })
  status: FileStatus;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
