import { Body, Controller, Delete, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  HighImpactConfirmationRequiredResponseDto,
  RenameRoleDto,
  RoleResponseDto,
  UpdateRolePermissionsDto,
} from '../dto/role.dto';
import { RoleStatus } from '../interfaces/system-role-template.interface';
import { RoleApplicationService } from '../services/role.application.service';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleApplicationService: RoleApplicationService) {}

  @Get()
  @ApiOperation({ summary: 'List all roles in current tenant with assigned user counts' })
  @ApiResponse({ status: 200, type: [RoleResponseDto] })
  async listRoles(): Promise<RoleResponseDto[]> {
    return this.roleApplicationService.listRoles();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role details and permission capabilities by ID' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async getRoleById(@Param('id') id: string): Promise<RoleResponseDto> {
    return this.roleApplicationService.getRoleById(id);
  }

  @Patch(':id/rename')
  @ApiOperation({ summary: 'Rename tenant-facing display label for a role' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async renameRole(@Param('id') id: string, @Body() dto: RenameRoleDto): Promise<RoleResponseDto> {
    return this.roleApplicationService.renameRole(id, dto);
  }

  @Put(':id/permissions')
  @ApiOperation({
    summary:
      'Update granted permissions on a role with capability protection and dependency validation',
  })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiResponse({ status: 200, type: HighImpactConfirmationRequiredResponseDto })
  async updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<{
    role?: RoleResponseDto;
    confirmationRequired?: boolean;
    affectedUserCount?: number;
    message?: string;
  }> {
    return this.roleApplicationService.updatePermissions(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update role status (ACTIVE / INACTIVE)' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async updateRoleStatus(
    @Param('id') id: string,
    @Body('status') status: RoleStatus,
  ): Promise<RoleResponseDto> {
    return this.roleApplicationService.updateRoleStatus(id, status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom role (system roles are blocked)' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  async deleteRole(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.roleApplicationService.deleteRole(id);
    return { success: true };
  }
}
