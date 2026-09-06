import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { User } from '../../user/entities/user.entity';

import { TableName } from '@/enums';

export enum MfaFactorType {
  TOTP = 'totp',
  EMAIL = 'email',
}

export enum MfaFactorStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Entity(TableName.MFA_METHODS)
export class MfaMethod extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'type', type: 'varchar', length: 30 })
  type: MfaFactorType;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: MfaFactorStatus;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'encrypted_secret', type: 'text', nullable: true })
  encryptedSecret?: string;

  @Column({ name: 'encrypted_email', type: 'text', nullable: true })
  encryptedEmail?: string;

  @Column({ name: 'masked_destination', type: 'varchar', length: 255, nullable: true })
  maskedDestination?: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt?: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
