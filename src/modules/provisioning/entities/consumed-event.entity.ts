import { Column, Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('kafka_consumed_events')
export class ConsumedEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'topic', type: 'varchar', length: 100 })
  topic: string;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;
}
