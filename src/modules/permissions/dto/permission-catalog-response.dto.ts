import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionItemDto {
  @ApiProperty({ description: 'Permission canonical ID', example: 'location.view' })
  readonly id: string;

  @ApiProperty({ description: 'Business module', example: 'setting' })
  readonly module: string;

  @ApiProperty({ description: 'Resource name', example: 'location' })
  readonly resource: string;

  @ApiProperty({ description: 'Action verb', example: 'view' })
  readonly action: string;

  @ApiPropertyOptional({
    description: 'Prerequisite permission IDs required',
    example: ['location.view'],
    type: [String],
  })
  readonly requires?: string[];

  @ApiPropertyOptional({
    description: 'Whether this permission qualifies as a navigation entry point',
    example: true,
  })
  readonly entry?: boolean;

  @ApiPropertyOptional({
    description: 'Whether this permission is deprecated',
    example: false,
  })
  readonly deprecated?: boolean;

  @ApiPropertyOptional({
    description: 'Deprecation timestamp',
    example: '2026-08-24T00:00:00Z',
  })
  readonly deprecatedAt?: string;

  @ApiPropertyOptional({
    description: 'Release version when this permission will be removed',
    example: 'v2.0.0',
  })
  readonly removedInVersion?: string;
}

export class ResourceGroupDto {
  @ApiProperty({ description: 'Resource name', example: 'location' })
  readonly resource: string;

  @ApiProperty({ description: 'Permissions under this resource', type: [PermissionItemDto] })
  readonly permissions: PermissionItemDto[];
}

export class ModuleGroupDto {
  @ApiProperty({ description: 'Module name', example: 'setting' })
  readonly module: string;

  @ApiProperty({ description: 'Resources in this module', type: [ResourceGroupDto] })
  readonly resources: ResourceGroupDto[];
}

export class PermissionCatalogResponseDto {
  @ApiProperty({ description: 'Total distinct modules count', example: 5 })
  readonly totalModules: number;

  @ApiProperty({ description: 'Total permissions count', example: 18 })
  readonly totalPermissions: number;

  @ApiProperty({ description: 'Hierarchical module capability list', type: [ModuleGroupDto] })
  readonly modules: ModuleGroupDto[];
}

export class DependencyRuleDto {
  @ApiProperty({ description: 'Permission identifier', example: 'location.create' })
  readonly permissionCode: string;

  @ApiProperty({
    description: 'Direct prerequisites required by this permission',
    example: ['location.view'],
  })
  readonly requires: string[];

  @ApiProperty({
    description: 'Direct dependents that require this permission',
    example: ['location.delete'],
  })
  readonly requiredBy: string[];
}

export class PermissionDependenciesResponseDto {
  @ApiProperty({ description: 'Dependency rules list', type: [DependencyRuleDto] })
  readonly dependencies: DependencyRuleDto[];
}
