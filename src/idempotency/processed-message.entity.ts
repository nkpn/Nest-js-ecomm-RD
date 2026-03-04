import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('processed_messages')
@Index('IDX_processed_messages_processed_at', ['processedAt'])
export class ProcessedMessage {
  @PrimaryColumn({ type: 'uuid', name: 'message_id' })
  messageId: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  handler: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'processed_at' })
  processedAt: Date;
}
