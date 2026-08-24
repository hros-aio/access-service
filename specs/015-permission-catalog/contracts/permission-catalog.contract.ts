/**
 * Shared Type & API Contracts for Permission Catalog
 * Exported via @hros/libs-contracts and consumed by access-service & web clients.
 */

export const PermissionCodes = {
  LOCATION_VIEW: 'location.view',
  LOCATION_CREATE: 'location.create',
  LOCATION_UPDATE: 'location.update',
  LOCATION_DEACTIVATE: 'location.deactivate',
  LOCATION_DELETE: 'location.delete',
  EMPLOYEE_VIEW: 'employee.view',
  EMPLOYEE_CREATE: 'employee.create',
  EMPLOYEE_UPDATE: 'employee.update',
  EMPLOYEE_ARCHIVE: 'employee.archive',
  ROLE_VIEW: 'role.view',
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  LEAVE_VIEW: 'leave.view',
  LEAVE_REQUEST: 'leave.request',
  LEAVE_APPROVE: 'leave.approve',
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_RUN: 'payroll.run',
} as const;

export type PermissionCode = (typeof PermissionCodes)[keyof typeof PermissionCodes];

export const PlatformModules = [
  'setting',
  'directory',
  'authorization',
  'leave',
  'payroll',
] as const;
export type PlatformModule = (typeof PlatformModules)[number];

export interface PermissionDto {
  readonly id: PermissionCode | string;
  readonly module: PlatformModule | string;
  readonly resource: string;
  readonly action: string;
  readonly requires?: readonly string[];
  readonly entry?: boolean;
  readonly deprecated?: boolean;
  readonly deprecatedAt?: string;
  readonly removedInVersion?: string;
}

export interface ResourceGroupDto {
  readonly resource: string;
  readonly permissions: readonly PermissionDto[];
}

export interface ModuleGroupDto {
  readonly module: string;
  readonly resources: readonly ResourceGroupDto[];
}

export interface PermissionCatalogResponseDto {
  readonly totalModules: number;
  readonly totalPermissions: number;
  readonly modules: readonly ModuleGroupDto[];
}

export interface DependencyRuleDto {
  readonly permissionCode: string;
  readonly requires: readonly string[];
  readonly requiredBy: readonly string[];
}

export interface PermissionDependenciesResponseDto {
  readonly dependencies: readonly DependencyRuleDto[];
}
