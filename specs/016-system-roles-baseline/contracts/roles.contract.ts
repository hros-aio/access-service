/**
 * Role API and Event Contracts
 */

export enum RoleType {
  SYSTEM = 'SYSTEM',
  CUSTOM = 'CUSTOM',
}

export enum SystemRoleKey {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  ADMINISTRATOR = 'ADMINISTRATOR',
}

export enum RoleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface RolePermissionDto {
  permissionCode: string;
  isProtected: boolean;
}

export interface RoleResponseDto {
  id: string;
  tenantCode: string;
  name: string;
  description?: string;
  type: RoleType;
  systemRoleKey?: SystemRoleKey;
  status: RoleStatus;
  version: number;
  permissions: RolePermissionDto[];
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RenameRoleDto {
  name: string;
  description?: string;
}

export interface UpdateRolePermissionsDto {
  permissionCodes: string[];
  confirmedHighImpact?: boolean;
}

export interface RoleUpdatedEventPayload {
  tenantCode: string;
  roleId: string;
  roleName: string;
  type: RoleType;
  systemRoleKey?: SystemRoleKey;
  version: number;
  action: 'CREATED' | 'RENAMED' | 'PERMISSIONS_UPDATED' | 'STATUS_CHANGED';
  updatedBy: string;
  timestamp: string;
}

export interface ProtectedCapabilityViolationAuditPayload {
  tenantCode: string;
  roleId: string;
  systemRoleKey: string;
  attemptedRemovedCapabilities: string[];
  actorUserId: string;
  timestamp: string;
}
