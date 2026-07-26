import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { User } from '../../user/entities/user.entity';

@Entity('auth_security_events_outbox')
export class AuthSecurityEventOutbox extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'sanitized_payload', type: 'jsonb', default: () => "'{}'::jsonb" })
  sanitizedPayload: object;

  @Column({ name: 'publish_status', type: 'varchar', length: 30, default: 'pending' })
  publishStatus: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
