import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { User } from '../../user/entities/user.entity';

@Entity('external_identities')
@Unique('uq_external_identity_subject', ['tenantCode', 'provider', 'providerSubject'])
@Unique('uq_external_identity_user_provider', ['userId', 'provider'])
export class ExternalIdentity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'provider', type: 'varchar', length: 50 })
  provider: string;

  @Column({ name: 'provider_subject', type: 'varchar', length: 255 })
  providerSubject: string;

  @Column({ name: 'provider_email', type: 'varchar', length: 320, nullable: true })
  providerEmail?: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
