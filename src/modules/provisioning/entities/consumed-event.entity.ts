import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import { TableName } from '../../../enums';

@Entity(TableName.KAFKA_CONSUMED_EVENTS)
export class ConsumedEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'topic', type: 'varchar', length: 100 })
  topic: string;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;
}
