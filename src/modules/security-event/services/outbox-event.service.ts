import { Injectable } from '@nestjs/common';
import { OutboxEventEntity, OutboxStatus } from '@new-hros/libs-sql';
import { DeepPartial } from 'typeorm';

import { EventType } from '../../../enums';
import { SyncJobPriority } from '../../authorization/entities/authorization-sync-job.entity';
import { Role } from '../../roles/entities/role.entity';
import { UserGroup } from '../../user-groups/entities/user-group.entity';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';

export enum OutboxAggregateType {
  ROLE = 'ROLE',
  USER_GROUP = 'USER_GROUP',
  AUTHORIZATION = 'AUTHORIZATION',
  AUTHZ_SYNC = 'AUTHZ_SYNC',
  USER = 'USER',
  SECURITY = 'SECURITY',
}

export interface OutboxContext {
  tenantCode: string;
  userId?: string;
}

export interface UserGroupCreatedEventData {
  userGroup: UserGroup;
  roleIds?: string[];
}

export interface UserGroupUpdatedEventData {
  userGroup: UserGroup;
  previousName?: string;
  previousDescription?: string;
  previousMatchingRule?: object;
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

export interface AuthorizationUserGroupUpdatedEventData {
  userGroup: UserGroup;
  isUrgent?: boolean;
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

export interface AuthorizationSyncRequestedData {
  jobId: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  triggerType: string;
  initiatedBy?: string | null;
}

export interface AuthorizationSyncCompletedData {
  jobId: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  triggerType: string;
  totalUsers?: number | null;
  processedUsers: number;
  affectedUsers?: number | null;
  durationMs?: number | null;
  isHighImpact?: boolean;
  isLongRunning?: boolean;
  requiresEmailNotification?: boolean;
  initiatedBy?: string | null;
}

export interface AuthorizationSyncFailedData {
  jobId: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  triggerType: string;
  failureReason?: string;
  sanitizedErrorCode?: string | null;
  sanitizedErrorDetails?: object | null;
  failedAfterRetries?: boolean;
  priority?: SyncJobPriority | string;
  totalUsers?: number | null;
  processedUsers?: number | null;
  durationMs?: number | null;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: object | null;
  requiresEmailNotification?: boolean;
  initiatedBy?: string | null;
}

@Injectable()
export class OutboxEventService {
  constructor(private readonly outboxRepository: OutboxEventRepository) {}

  // -------------------------------------------------------------
  // Static Factory Methods returning OutboxEventEntity
  // -------------------------------------------------------------

  static fromRoleCreated(ctx: OutboxContext, data: RoleCreatedEventData): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_CREATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      roleType: data.role.type,
      version: data.role.version,
      permissionCodes: data.permissionCodes,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromRoleCopied(ctx: OutboxContext, data: RoleCopiedEventData): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_COPIED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
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
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromRoleDeactivated(
    ctx: OutboxContext,
    data: RoleDeactivatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_DEACTIVATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
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
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromRoleReactivated(
    ctx: OutboxContext,
    data: RoleReactivatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_REACTIVATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      roleType: data.role.type,
      version: data.role.version,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromRenameRole(ctx: OutboxContext, data: RenameRoleEventData): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_RENAMED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      oldName: data.oldName,
      newName: data.newName,
      roleType: data.role.type,
      systemRoleKey: data.role.systemRoleKey,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromPermissionsUpdated(
    ctx: OutboxContext,
    data: PermissionsUpdatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_PERMISSIONS_UPDATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      version: data.role.version,
      permissionCodes: data.permissionCodes,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromProtectedCapabilityViolation(
    ctx: OutboxContext,
    data: ProtectedCapabilityViolationEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.ROLE;
    event.aggregateId = data.role.id;
    event.eventType = EventType.ROLE_PROTECTED_CAPABILITY_VIOLATION;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      roleId: data.role.id,
      tenantCode: ctx.tenantCode,
      roleName: data.role.name,
      omittedProtectedCapabilities: data.omittedProtectedCapabilities,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupCreated(
    ctx: OutboxContext,
    data: UserGroupCreatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_CREATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      name: data.userGroup.name,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      roleIds: data.roleIds ?? [],
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupUpdated(
    ctx: OutboxContext,
    data: UserGroupUpdatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_UPDATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      previousName: data.previousName,
      previousDescription: data.previousDescription,
      previousMatchingRule: data.previousMatchingRule,
      addedRoleIds: data.addedRoleIds,
      removedRoleIds: data.removedRoleIds,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupDeactivated(
    ctx: OutboxContext,
    data: UserGroupDeactivatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_DEACTIVATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupReactivated(
    ctx: OutboxContext,
    data: UserGroupReactivatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_REACTIVATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupRolesAssigned(
    ctx: OutboxContext,
    data: UserGroupRolesAssignedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_ROLES_ASSIGNED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      assignedRoleIds: data.assignedRoleIds,
      addedRoleIds: data.addedRoleIds,
      previousRoleIds: data.previousRoleIds,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupRoleUnassigned(
    ctx: OutboxContext,
    data: UserGroupRoleUnassignedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_ROLE_UNASSIGNED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      assignedRoleIds: data.assignedRoleIds,
      removedRoleIds: data.removedRoleIds,
      previousRoleIds: data.previousRoleIds,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromUserGroupScopeUpdated(
    ctx: OutboxContext,
    data: UserGroupScopeUpdatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.USER_GROUP_SCOPE_UPDATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      groupName: data.userGroup.name,
      version: data.userGroup.version,
      previousScope: data.previousScope,
      newScope: data.newScope,
      actorUserId: ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromAuthorizationUserGroupUpdated(
    ctx: OutboxContext,
    data: AuthorizationUserGroupUpdatedEventData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.USER_GROUP;
    event.aggregateId = data.userGroup.id;
    event.eventType = EventType.AUTHORIZATION_USER_GROUP_UPDATED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      userGroupId: data.userGroup.id,
      tenantCode: ctx.tenantCode,
      version: data.userGroup.version,
      priority: data.isUrgent ? 'URGENT' : 'STANDARD',
      urgency: data.isUrgent ? 'URGENT' : 'STANDARD',
      isUrgent: data.isUrgent ?? false,
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromAuthorizationSyncRequested(
    ctx: OutboxContext,
    data: AuthorizationSyncRequestedData,
  ): OutboxEventEntity {
    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.AUTHZ_SYNC;
    event.aggregateId = data.jobId;
    event.eventType = EventType.AUTHORIZATION_SYNC_REQUESTED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      jobId: data.jobId,
      tenantCode: ctx.tenantCode,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion,
      triggerType: data.triggerType,
      initiatedBy: data.initiatedBy ?? ctx.userId ?? 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromAuthorizationSyncCompleted(
    ctx: OutboxContext,
    data: AuthorizationSyncCompletedData,
  ): OutboxEventEntity {
    const processedUsers = data.processedUsers ?? 0;
    const durationMs = data.durationMs ?? 0;
    const isHighImpact = data.isHighImpact ?? processedUsers >= 500;
    const isLongRunning = data.isLongRunning ?? durationMs >= 30000;
    const requiresEmailNotification =
      data.requiresEmailNotification ?? (isHighImpact || isLongRunning);

    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.AUTHZ_SYNC;
    event.aggregateId = data.jobId;
    event.eventType = EventType.AUTHORIZATION_SYNC_COMPLETED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      jobId: data.jobId,
      tenantCode: ctx.tenantCode,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion,
      triggerType: data.triggerType,
      totalUsers: data.totalUsers ?? 0,
      processedUsers,
      affectedUsers: data.affectedUsers ?? 0,
      durationMs,
      isHighImpact,
      isLongRunning,
      requiresEmailNotification,
      initiatedBy: data.initiatedBy ?? null,
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  static fromAuthorizationSyncFailed(
    ctx: OutboxContext,
    data: AuthorizationSyncFailedData,
  ): OutboxEventEntity {
    const isCritical =
      data.priority === 'CRITICAL' ||
      data.priority === SyncJobPriority.URGENT ||
      data.failedAfterRetries === true ||
      !data.priority;

    const failureReason = data.failureReason ?? data.errorMessage ?? 'Unknown failure';
    const sanitizedErrorCode = data.sanitizedErrorCode ?? data.errorCode ?? 'INTERNAL_ERROR';
    const sanitizedErrorDetails = data.sanitizedErrorDetails ?? data.errorDetails ?? {};

    const event = new OutboxEventEntity();
    event.tenantCode = ctx.tenantCode;
    event.aggregateType = OutboxAggregateType.AUTHZ_SYNC;
    event.aggregateId = data.jobId;
    event.eventType = EventType.AUTHORIZATION_SYNC_FAILED;
    event.eventVersion = 1;
    event.status = OutboxStatus.PENDING;
    event.payload = {
      jobId: data.jobId,
      tenantCode: ctx.tenantCode,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion,
      triggerType: data.triggerType,
      failureReason,
      sanitizedErrorCode,
      sanitizedErrorDetails,
      failedAfterRetries: data.failedAfterRetries ?? false,
      priority: data.priority ?? SyncJobPriority.STANDARD,
      urgency: isCritical ? 'CRITICAL' : 'STANDARD',
      totalUsers: data.totalUsers ?? 0,
      processedUsers: data.processedUsers ?? 0,
      durationMs: data.durationMs ?? 0,
      errorCode: sanitizedErrorCode,
      errorMessage: failureReason,
      errorDetails: sanitizedErrorDetails,
      requiresEmailNotification: data.requiresEmailNotification ?? true,
      initiatedBy: data.initiatedBy ?? null,
      timestamp: new Date().toISOString(),
    };
    Object.assign(event, { sanitizedPayload: event.payload });
    return event;
  }

  // -------------------------------------------------------------
  // Instance Methods (save via OutboxEventRepository)
  // -------------------------------------------------------------

  private toPlainOutboxData(event: OutboxEventEntity): DeepPartial<OutboxEventEntity> {
    return {
      tenantCode: event.tenantCode,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      status: event.status,
      payload: event.payload,
    };
  }

  async create(entityData: DeepPartial<OutboxEventEntity>): Promise<OutboxEventEntity> {
    return this.outboxRepository.create(entityData);
  }

  async fromRoleCreated(
    ctx: OutboxContext,
    data: RoleCreatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromRoleCreated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromRoleCopied(ctx: OutboxContext, data: RoleCopiedEventData): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromRoleCopied(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromRoleDeactivated(
    ctx: OutboxContext,
    data: RoleDeactivatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromRoleDeactivated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromRoleReactivated(
    ctx: OutboxContext,
    data: RoleReactivatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromRoleReactivated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromRenameRole(ctx: OutboxContext, data: RenameRoleEventData): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromRenameRole(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromPermissionsUpdated(
    ctx: OutboxContext,
    data: PermissionsUpdatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromPermissionsUpdated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromProtectedCapabilityViolation(
    ctx: OutboxContext,
    data: ProtectedCapabilityViolationEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromProtectedCapabilityViolation(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupCreated(
    ctx: OutboxContext,
    data: UserGroupCreatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupCreated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupUpdated(
    ctx: OutboxContext,
    data: UserGroupUpdatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupUpdated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupDeactivated(
    ctx: OutboxContext,
    data: UserGroupDeactivatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupDeactivated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupReactivated(
    ctx: OutboxContext,
    data: UserGroupReactivatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupReactivated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupRolesAssigned(
    ctx: OutboxContext,
    data: UserGroupRolesAssignedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupRolesAssigned(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupRoleUnassigned(
    ctx: OutboxContext,
    data: UserGroupRoleUnassignedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupRoleUnassigned(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromUserGroupScopeUpdated(
    ctx: OutboxContext,
    data: UserGroupScopeUpdatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromUserGroupScopeUpdated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromAuthorizationUserGroupUpdated(
    ctx: OutboxContext,
    data: AuthorizationUserGroupUpdatedEventData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromAuthorizationUserGroupUpdated(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromAuthorizationSyncRequested(
    ctx: OutboxContext,
    data: AuthorizationSyncRequestedData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromAuthorizationSyncRequested(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromAuthorizationSyncCompleted(
    ctx: OutboxContext,
    data: AuthorizationSyncCompletedData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromAuthorizationSyncCompleted(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }

  async fromAuthorizationSyncFailed(
    ctx: OutboxContext,
    data: AuthorizationSyncFailedData,
  ): Promise<OutboxEventEntity> {
    const event = OutboxEventService.fromAuthorizationSyncFailed(ctx, data);
    return this.outboxRepository.create(this.toPlainOutboxData(event));
  }
}
