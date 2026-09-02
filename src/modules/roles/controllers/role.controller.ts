import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaginatedResult } from '@new-hros/libs-sql';

import {
  CopyRoleDto,
  CreateCustomRoleDto,
  DeactivateRoleDto,
  FilterRoleDto,
  HighImpactConfirmationRequiredResponseDto,
  PaginatedRoleResponseDto,
  RenameRoleDto,
  RoleImpactResponseDto,
  RoleResponseDto,
  UpdateCustomRoleDto,
} from '../dto/role.dto';
import { RoleApplicationService } from '../services/role.application.service';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleApplicationService: RoleApplicationService) {}

  @Get()
  @ApiOperation({ summary: 'List all roles in current tenant with metrics and unassigned badges' })
  @ApiResponse({ status: 200, type: PaginatedRoleResponseDto })
  async listRoles(@Query() query: FilterRoleDto): Promise<PaginatedResult<RoleResponseDto>> {
    const results = await this.roleApplicationService.list(query);
    return {
      ...results,
      data: results.data.map((role) => RoleResponseDto.fromRole(role)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role details and permission capabilities by ID' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async getRoleById(@Param('id') id: string): Promise<RoleResponseDto> {
    const role = await this.roleApplicationService.getById(id);
    return RoleResponseDto.fromRole(role);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new active custom role with permission dependency validation',
  })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  async createCustomRole(@Body() dto: CreateCustomRoleDto): Promise<RoleResponseDto> {
    const role = await this.roleApplicationService.createCustom(dto);
    return RoleResponseDto.fromRole(role);
  }

  @Post(':id/copy')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Clone an existing System or Custom role with protection reset' })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  async copyRole(@Param('id') id: string, @Body() dto: CopyRoleDto): Promise<RoleResponseDto> {
    const role = await this.roleApplicationService.copy(id, dto);
    return RoleResponseDto.fromRole(role);
  }

  @Get(':id/impact')
  @ApiOperation({ summary: 'Estimate reach and blast-radius for role changes' })
  @ApiResponse({ status: 200, type: RoleImpactResponseDto })
  async estimateImpact(@Param('id') id: string): Promise<RoleImpactResponseDto> {
    const [assignedUserGroupCount, activeUserReachCount] =
      await this.roleApplicationService.estimateImpact(id);
    return {
      assignedUserGroupCount,
      activeUserReachCount,
    };
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update custom role metadata and permissions with optimistic locking',
  })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiResponse({ status: 200, type: HighImpactConfirmationRequiredResponseDto })
  async updateCustomRole(
    @Param('id') id: string,
    @Body() dto: UpdateCustomRoleDto,
  ): Promise<RoleResponseDto | HighImpactConfirmationRequiredResponseDto> {
    const result = await this.roleApplicationService.updateCustom(id, dto);
    if (result instanceof HighImpactConfirmationRequiredResponseDto) {
      return result;
    }
    return RoleResponseDto.fromRole(result);
  }

  @Patch(':id/permissions')
  @ApiOperation({
    summary: 'Synchronously update or revoke permissions for a role with immediate Redis eviction',
  })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiResponse({ status: 200, type: HighImpactConfirmationRequiredResponseDto })
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() dto: { permissionCodes: string[]; version?: number; confirmed?: boolean },
  ): Promise<RoleResponseDto | HighImpactConfirmationRequiredResponseDto> {
    const result = await this.roleApplicationService.updatePermissions(id, dto);
    if (result instanceof HighImpactConfirmationRequiredResponseDto) {
      return result;
    }
    return RoleResponseDto.fromRole(result);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a custom role with multi-group impact check' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiResponse({ status: 200, type: HighImpactConfirmationRequiredResponseDto })
  async deactivateRole(
    @Param('id') id: string,
    @Body() dto?: DeactivateRoleDto,
  ): Promise<RoleResponseDto | HighImpactConfirmationRequiredResponseDto> {
    const result = await this.roleApplicationService.deactivate(id, dto);
    if (result instanceof HighImpactConfirmationRequiredResponseDto) {
      return result;
    }
    return RoleResponseDto.fromRole(result);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a deactivated custom role' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async reactivateRole(@Param('id') id: string): Promise<RoleResponseDto> {
    const result = await this.roleApplicationService.reactivate(id);
    return RoleResponseDto.fromRole(result);
  }

  @Patch(':id/rename')
  @ApiOperation({ summary: 'Rename tenant-facing display label for a role' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async renameRole(@Param('id') id: string, @Body() dto: RenameRoleDto): Promise<RoleResponseDto> {
    const result = await this.roleApplicationService.rename(id, dto);
    return RoleResponseDto.fromRole(result);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom role (system roles are blocked)' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  async deleteRole(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.roleApplicationService.delete(id);
    return { success: true };
  }
}
