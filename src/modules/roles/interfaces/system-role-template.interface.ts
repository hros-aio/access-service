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
