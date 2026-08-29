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

import {
  CopyRoleDto,
  CreateCustomRoleDto,
  DeactivateRoleDto,
  FilterRoleDto,
  HighImpactConfirmationRequiredResponseDto,
  RenameRoleDto,
  RoleImpactResponseDto,
  RoleResponseDto,
  UpdateCustomRoleDto,
} from '../dto/role.dto';
import { RoleStatus } from '../interfaces/system-role-template.interface';
import { RoleApplicationService } from '../services/role.application.service';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleApplicationService: RoleApplicationService) {}

  @Get()
  @ApiOperation({ summary: 'List all roles in current tenant with metrics and unassigned badges' })
  @ApiResponse({ status: 200, type: [RoleResponseDto] })
  async listRoles(@Query() query: FilterRoleDto): Promise<RoleResponseDto[]> {
    return this.roleApplicationService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role details and permission capabilities by ID' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async getRoleById(@Param('id') id: string): Promise<RoleResponseDto> {
    return this.roleApplicationService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new active custom role with permission dependency validation',
  })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  async createCustomRole(@Body() dto: CreateCustomRoleDto): Promise<RoleResponseDto> {
    return this.roleApplicationService.createCustom(dto);
  }

  @Post(':id/copy')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Clone an existing System or Custom role with protection reset' })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  async copyRole(@Param('id') id: string, @Body() dto: CopyRoleDto): Promise<RoleResponseDto> {
    return this.roleApplicationService.copy(id, dto);
  }

  @Get(':id/impact')
  @ApiOperation({ summary: 'Estimate reach and blast-radius for role changes' })
  @ApiResponse({ status: 200, type: RoleImpactResponseDto })
  async estimateImpact(@Param('id') id: string): Promise<RoleImpactResponseDto> {
    return this.roleApplicationService.estimateImpact(id);
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
  ): Promise<{
    role?: RoleResponseDto;
    confirmationRequired?: boolean;
    affectedUserCount?: number;
    message?: string;
  }> {
    return this.roleApplicationService.updateCustom(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a custom role with multi-group impact check' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiResponse({ status: 200, type: HighImpactConfirmationRequiredResponseDto })
  async deactivateRole(
    @Param('id') id: string,
    @Body() dto?: DeactivateRoleDto,
  ): Promise<{
    role?: RoleResponseDto;
    confirmationRequired?: boolean;
    affectedUserGroupCount?: number;
    affectedUserCount?: number;
    message?: string;
  }> {
    return this.roleApplicationService.deactivate(id, dto);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a deactivated custom role' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async reactivateRole(@Param('id') id: string): Promise<RoleResponseDto> {
    return this.roleApplicationService.reactivate(id);
  }

  @Patch(':id/rename')
  @ApiOperation({ summary: 'Rename tenant-facing display label for a role' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async renameRole(@Param('id') id: string, @Body() dto: RenameRoleDto): Promise<RoleResponseDto> {
    return this.roleApplicationService.rename(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update role status (ACTIVE / INACTIVE)' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async updateRoleStatus(
    @Param('id') id: string,
    @Body('status') status: RoleStatus,
  ): Promise<RoleResponseDto> {
    return this.roleApplicationService.updateStatus(id, status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom role (system roles are blocked)' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  async deleteRole(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.roleApplicationService.delete(id);
    return { success: true };
  }
}
