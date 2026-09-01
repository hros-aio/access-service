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

export interface SystemRolePermissionTemplate {
  code: string;
  isProtected: boolean;
}

export interface SystemRoleTemplate {
  key: SystemRoleKey;
  defaultName: string;
  description: string;
  permissions: SystemRolePermissionTemplate[];
}

export interface CachedRoleData {
  roleId: string;
  tenantCode: string;
  name: string;
  type: RoleType;
  systemRoleKey: SystemRoleKey | undefined;
  status: RoleStatus;
  version: number;
  permissions: {
    code: string;
    isProtected: boolean;
  }[];
  updatedAt: string;
}
