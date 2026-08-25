import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { EventType, TableName } from '../../../enums';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../user/entities/user.entity';

export interface OutboxContext {
  tenantCode: string;
  userId?: string;
}

export interface RenameRoleEventData {
  role: Role;
  oldName: string;
  newName: string;
}

export interface PermissionsUpdatedEventData {
  role: Role;
  permissionCodes: string[];
}

export interface ProtectedCapabilityViolationEventData {
  role: Role;
  omittedProtectedCapabilities: string[];
}

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

  static fromRenameRole(ctx: OutboxContext, data: RenameRoleEventData): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_RENAMED;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      oldName: data.oldName,
      newName: data.newName,
      roleType: data.role.type,
      systemRoleKey: data.role.systemRoleKey,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromPermissionsUpdated(
    ctx: OutboxContext,
    data: PermissionsUpdatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_PERMISSIONS_UPDATED;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      version: data.role.version,
      permissionCodes: data.permissionCodes,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromProtectedCapabilityViolation(
    ctx: OutboxContext,
    data: ProtectedCapabilityViolationEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_PROTECTED_CAPABILITY_VIOLATION;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      systemRoleKey: data.role.systemRoleKey,
      omittedProtectedCapabilities: data.omittedProtectedCapabilities,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }
}
