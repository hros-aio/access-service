import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  PermissionCatalogResponseDto,
  PermissionDependenciesResponseDto,
} from '../dto/permission-catalog-response.dto';
import { PermissionCatalogService } from '../services/permission-catalog.service';

@ApiTags('Authorization - Permission Catalog')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly catalogService: PermissionCatalogService) {}

  @Get('catalog')
  @ApiOperation({
    summary: 'Retrieve structured permission catalog',
    description:
      'Returns the full platform-defined permission catalog hierarchically grouped by module and resource for Role Matrix rendering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Hierarchical permission catalog successfully retrieved.',
    type: PermissionCatalogResponseDto,
  })
  public getCatalog(): PermissionCatalogResponseDto {
    return this.catalogService.getCatalogHierarchy();
  }

  @Get('dependencies')
  @ApiOperation({
    summary: 'Retrieve permission dependency matrix',
    description:
      'Returns the complete capability dependency rules and reverse dependent mappings for frontend matrix guidance.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dependency matrix rules successfully retrieved.',
    type: PermissionDependenciesResponseDto,
  })
  public getDependencies(): PermissionDependenciesResponseDto {
    return this.catalogService.getDependencyMatrix();
  }
}
