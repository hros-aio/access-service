import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { Role } from '../entities/role.entity';
import { RoleStatus, RoleType, SystemRoleKey } from '../interfaces/system-role-template.interface';

export class RolePermissionDto {
  @ApiProperty({ example: 'employee.view' })
  readonly permissionCode: string;

  @ApiProperty({ example: true })
  readonly isProtected: boolean;
}

export class RoleResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  readonly id: string;

  @ApiProperty({ example: 'tenant-001' })
  readonly tenantCode: string;

  @ApiProperty({ example: 'Employee' })
  readonly name: string;

  @ApiPropertyOptional({ example: 'Standard baseline employee access' })
  readonly description?: string;

  @ApiProperty({ enum: RoleType, example: RoleType.SYSTEM })
  readonly type: RoleType;

  @ApiPropertyOptional({ enum: SystemRoleKey, example: SystemRoleKey.EMPLOYEE })
  readonly systemRoleKey?: SystemRoleKey;

  @ApiProperty({ enum: RoleStatus, example: RoleStatus.ACTIVE })
  readonly status: RoleStatus;

  @ApiProperty({ example: 1 })
  readonly version: number;

  @ApiProperty({ type: [RolePermissionDto] })
  readonly permissions: RolePermissionDto[];

  @ApiPropertyOptional({ example: 42 })
  readonly userCount?: number;

  @ApiPropertyOptional({ example: false, description: 'True if not assigned to any user group' })
  readonly isUnassigned?: boolean;

  @ApiPropertyOptional({ example: 2 })
  readonly assignedUserGroupCount?: number;

  @ApiPropertyOptional({ example: 42 })
  readonly activeUserReachCount?: number;

  @ApiProperty({ example: '2026-08-25T00:00:00.000Z' })
  readonly createdAt: string;

  @ApiProperty({ example: '2026-08-25T00:00:00.000Z' })
  readonly updatedAt: string;

  static fromRole(
    role: Role,
    userCount?: number,
    options?: {
      isUnassigned?: boolean;
      assignedUserGroupCount?: number;
      activeUserReachCount?: number;
    },
  ): RoleResponseDto {
    const activeReach = options?.activeUserReachCount ?? userCount;
    const isUnassigned =
      options?.isUnassigned !== undefined
        ? options.isUnassigned
        : options?.assignedUserGroupCount !== undefined
          ? options.assignedUserGroupCount === 0
          : undefined;

    return {
      id: role.id,
      tenantCode: role.tenantCode,
      name: role.name,
      description: role.description,
      type: role.type,
      systemRoleKey: role.systemRoleKey,
      status: role.status,
      version: role.version,
      permissions: (role.permissions || []).map((p) => ({
        permissionCode: p.permissionCode,
        isProtected: p.isProtected,
      })),
      userCount: activeReach,
      isUnassigned,
      assignedUserGroupCount: options?.assignedUserGroupCount,
      activeUserReachCount: activeReach,
      createdAt: role.createdAt ? role.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: role.updatedAt ? role.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}

export class CreateCustomRoleDto {
  @ApiProperty({
    example: 'HR Specialist',
    description: 'Unique custom role name within the tenant',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  readonly name: string;

  @ApiPropertyOptional({ example: 'Specialist handling employee profile management' })
  @IsString()
  @IsOptional()
  readonly description?: string;

  @ApiProperty({
    type: [String],
    example: ['employee.view', 'employee.update'],
    description: 'Granted permission codes satisfying DAG capability dependencies',
  })
  @IsArray()
  @IsString({ each: true })
  readonly permissionCodes: string[];
}

export class CopyRoleDto {
  @ApiProperty({
    example: 'Custom Admin',
    description: 'Unique name for the cloned custom role',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  readonly name: string;

  @ApiPropertyOptional({ example: 'Cloned from Built-in Admin with customized capabilities' })
  @IsString()
  @IsOptional()
  readonly description?: string;
}

export class UpdateCustomRoleDto {
  @ApiProperty({
    example: 'Senior HR Specialist',
    description: 'Updated role name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  readonly name: string;

  @ApiPropertyOptional({ example: 'Updated role description' })
  @IsString()
  @IsOptional()
  readonly description?: string;

  @ApiProperty({
    example: 1,
    description: 'Expected role version for optimistic concurrency control',
  })
  readonly version: number;

  @ApiProperty({
    type: [String],
    example: ['employee.view', 'employee.update', 'department.view'],
    description: 'Complete permission codes for the updated role',
  })
  @IsArray()
  @IsString({ each: true })
  readonly permissionCodes: string[];

  @ApiPropertyOptional({
    example: false,
    description: 'Confirmation flag if affected user count exceeds high impact threshold',
  })
  @IsBoolean()
  @IsOptional()
  readonly confirmedHighImpact?: boolean;
}

export class DeactivateRoleDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Expected role version for optimistic locking',
  })
  @IsOptional()
  readonly version?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Confirmation flag to deactivate despite active user group assignments',
  })
  @IsBoolean()
  @IsOptional()
  readonly confirmed?: boolean;
}

export class RoleImpactResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  readonly roleId: string;

  @ApiProperty({ example: 2 })
  readonly assignedUserGroupCount: number;

  @ApiProperty({ example: 45 })
  readonly activeUserReachCount: number;

  @ApiProperty({ example: false })
  readonly isUnassigned: boolean;
}

export class RenameRoleDto {
  @ApiProperty({
    example: 'Team Member',
    description: 'Custom display name for the role within the tenant',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  readonly name: string;

  @ApiPropertyOptional({ example: 'Updated description for this role' })
  @IsString()
  @IsOptional()
  readonly description?: string;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['employee.view', 'location.view', 'leave.view', 'leave.request'],
    description: 'Complete desired permission codes for the role',
  })
  @IsArray()
  @IsString({ each: true })
  readonly permissionCodes: string[];

  @ApiPropertyOptional({
    example: false,
    description: 'Explicit confirmation flag required when updating high-impact roles',
  })
  @IsBoolean()
  @IsOptional()
  readonly confirmedHighImpact?: boolean;
}

export class HighImpactConfirmationRequiredResponseDto {
  @ApiProperty({ example: true })
  readonly confirmationRequired: boolean;

  @ApiProperty({ example: 150 })
  readonly affectedUserCount: number;

  @ApiPropertyOptional({ example: 2 })
  readonly affectedUserGroupCount?: number;

  @ApiProperty({ example: 'This change affects 150 active users. Please confirm to proceed.' })
  readonly message: string;
}
