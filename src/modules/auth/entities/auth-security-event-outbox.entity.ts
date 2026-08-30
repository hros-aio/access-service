import { BaseEntity } from '@new-hros/libs-sql';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { EventType, TableName } from '../../../enums';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../user/entities/user.entity';
import { UserGroup } from '../../user-groups/entities/user-group.entity';

export interface OutboxContext {
  tenantCode: string;
  userId?: string;
}

export interface UserGroupCreatedEventData {
  userGroup: UserGroup;
  roleIds: string[];
}

export interface UserGroupUpdatedEventData {
  userGroup: UserGroup;
  addedRoleIds?: string[];
  removedRoleIds?: string[];
}

export interface UserGroupRolesAssignedEventData {
  userGroup: UserGroup;
  assignedRoleIds: string[];
  addedRoleIds: string[];
  previousRoleIds: string[];
}

export interface UserGroupRoleUnassignedEventData {
  userGroup: UserGroup;
  assignedRoleIds: string[];
  removedRoleIds: string[];
  previousRoleIds: string[];
}

export interface UserGroupDeactivatedEventData {
  userGroup: UserGroup;
}

export interface UserGroupReactivatedEventData {
  userGroup: UserGroup;
}

export interface UserGroupScopeUpdatedEventData {
  userGroup: UserGroup;
  previousScope: {
    scopeType: string;
    scopeRefId?: string | null;
  };
  newScope: {
    scopeType: string;
    scopeRefId?: string | null;
  };
}

export interface RoleCreatedEventData {
  role: Role;
  permissionCodes: string[];
}

export interface RoleCopiedEventData {
  role: Role;
  sourceRoleId: string;
  permissionCodes: string[];
}

export interface RoleDeactivatedEventData {
  role: Role;
  affectedUserGroupCount?: number;
  affectedUserCount?: number;
}

export interface RoleReactivatedEventData {
  role: Role;
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

  static fromRoleCreated(ctx: OutboxContext, data: RoleCreatedEventData): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_CREATED;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      roleType: data.role.type,
      version: data.role.version,
      permissionCodes: data.permissionCodes,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromRoleCopied(ctx: OutboxContext, data: RoleCopiedEventData): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_COPIED;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      sourceRoleId: data.sourceRoleId,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      roleType: data.role.type,
      version: data.role.version,
      permissionCodes: data.permissionCodes,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromRoleDeactivated(
    ctx: OutboxContext,
    data: RoleDeactivatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_DEACTIVATED;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      roleType: data.role.type,
      version: data.role.version,
      affectedUserGroupCount: data.affectedUserGroupCount ?? 0,
      affectedUserCount: data.affectedUserCount ?? 0,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromRoleReactivated(
    ctx: OutboxContext,
    data: RoleReactivatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.ROLE_REACTIVATED;
    outbox.sanitizedPayload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      roleType: data.role.type,
      version: data.role.version,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

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

  static fromUserGroupCreated(
    ctx: OutboxContext,
    data: UserGroupCreatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_CREATED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      scopeType: data.userGroup.scopeType,
      scopeRefId: data.userGroup.scopeRefId,
      status: data.userGroup.status,
      version: data.userGroup.version,
      roleIds: data.roleIds,
      ruleAttributeKeys: data.userGroup.ruleAttributeKeys,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromUserGroupUpdated(
    ctx: OutboxContext,
    data: UserGroupUpdatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_UPDATED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      scopeType: data.userGroup.scopeType,
      scopeRefId: data.userGroup.scopeRefId,
      status: data.userGroup.status,
      version: data.userGroup.version,
      addedRoleIds: data.addedRoleIds ?? [],
      removedRoleIds: data.removedRoleIds ?? [],
      ruleAttributeKeys: data.userGroup.ruleAttributeKeys,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromUserGroupRolesAssigned(
    ctx: OutboxContext,
    data: UserGroupRolesAssignedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_ROLES_ASSIGNED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      version: data.userGroup.version,
      assignedRoleIds: data.assignedRoleIds,
      addedRoleIds: data.addedRoleIds,
      previousRoleIds: data.previousRoleIds,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromUserGroupRoleUnassigned(
    ctx: OutboxContext,
    data: UserGroupRoleUnassignedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_ROLE_UNASSIGNED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      version: data.userGroup.version,
      assignedRoleIds: data.assignedRoleIds,
      removedRoleIds: data.removedRoleIds,
      previousRoleIds: data.previousRoleIds,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromUserGroupDeactivated(
    ctx: OutboxContext,
    data: UserGroupDeactivatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_DEACTIVATED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      version: data.userGroup.version,
      status: data.userGroup.status,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromUserGroupReactivated(
    ctx: OutboxContext,
    data: UserGroupReactivatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_REACTIVATED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      version: data.userGroup.version,
      status: data.userGroup.status,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromUserGroupScopeUpdated(
    ctx: OutboxContext,
    data: UserGroupScopeUpdatedEventData,
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.USER_GROUP_SCOPE_UPDATED;
    outbox.sanitizedPayload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      name: data.userGroup.name,
      previousScope: data.previousScope,
      newScope: data.newScope,
      version: data.userGroup.version,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromAuthorizationUserGroupUpdated(
    ctx: OutboxContext,
    data: { userGroup: UserGroup },
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.AUTHORIZATION_USER_GROUP_UPDATED;
    outbox.sanitizedPayload = {
      tenantCode: ctx.tenantCode,
      userGroupId: data.userGroup.id,
      version: data.userGroup.version,
      ruleAttributeKeys: data.userGroup.ruleAttributeKeys,
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromAuthorizationSyncRequested(
    ctx: OutboxContext,
    data: {
      jobId: string;
      sourceType: string;
      sourceId: string;
      sourceVersion: number;
      triggerType: string;
      initiatedBy?: string | null;
    },
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.AUTHORIZATION_SYNC_REQUESTED;
    outbox.sanitizedPayload = {
      jobId: data.jobId,
      tenantCode: ctx.tenantCode,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion,
      triggerType: data.triggerType,
      initiatedBy: data.initiatedBy ?? ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromAuthorizationSyncCompleted(
    ctx: OutboxContext,
    data: {
      jobId: string;
      sourceType: string;
      sourceId: string;
      sourceVersion: number;
      triggerType: string;
      totalUsers?: number | null;
      processedUsers: number;
      initiatedBy?: string | null;
    },
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.AUTHORIZATION_SYNC_COMPLETED;
    outbox.sanitizedPayload = {
      jobId: data.jobId,
      tenantCode: ctx.tenantCode,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion,
      triggerType: data.triggerType,
      totalUsers: data.totalUsers ?? data.processedUsers,
      processedUsers: data.processedUsers,
      initiatedBy: data.initiatedBy ?? ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }

  static fromAuthorizationSyncFailed(
    ctx: OutboxContext,
    data: {
      jobId: string;
      sourceType: string;
      sourceId: string;
      sourceVersion: number;
      triggerType: string;
      totalUsers?: number | null;
      processedUsers: number;
      errorDetails?: Record<string, unknown> | null;
      initiatedBy?: string | null;
    },
  ): AuthSecurityEventOutbox {
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = ctx.tenantCode;
    outbox.userId = ctx.userId;
    outbox.eventType = EventType.AUTHORIZATION_SYNC_FAILED;
    outbox.sanitizedPayload = {
      jobId: data.jobId,
      tenantCode: ctx.tenantCode,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion,
      triggerType: data.triggerType,
      totalUsers: data.totalUsers,
      processedUsers: data.processedUsers,
      errorDetails: data.errorDetails ?? null,
      initiatedBy: data.initiatedBy ?? ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    outbox.publishStatus = 'pending';
    return outbox;
  }
}
