import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne, VersionColumn } from 'typeorm';

import { InvitationStatus, TableName } from '../../../enums';
import { User } from '../../user/entities/user.entity';

@Entity(TableName.INVITATIONS)
export class Invitation extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'token_hash', type: 'text', unique: true })
  tokenHash: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: InvitationStatus;

  @VersionColumn({ default: 1 })
  version: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'issued_by', type: 'uuid', nullable: true })
  issuedBy?: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'issued_by' })
  issuer?: User;

  public isExpired(): boolean {
    return (
      (this.status !== InvitationStatus.PENDING && this.status !== InvitationStatus.SENT) ||
      this.expiresAt < new Date()
    );
  }
}
