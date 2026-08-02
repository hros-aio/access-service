import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { TableName } from '../../../enums';
import { User } from '../../user/entities/user.entity';

@Entity(TableName.AUTH_SECURITY_EVENTS_OUTBOX)
export class AuthSecurityEventOutbox extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'sanitized_payload', type: 'jsonb', default: () => "'{}'::jsonb" })
  sanitizedPayload: object;

  @Column({ name: 'publish_status', type: 'varchar', length: 30, default: 'pending' })
  publishStatus: string;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_attempted_at', type: 'timestamptz', nullable: true })
  lastAttemptedAt?: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
