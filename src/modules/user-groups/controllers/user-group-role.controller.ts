import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  AssignedRoleItemDto,
  EstimateRoleAssignmentImpactDto,
  RoleAssignmentImpactEstimateDto,
  UpdateUserGroupRolesDto,
} from '../dto';
import { UserGroupImpactService } from '../services/user-group-impact.service';
import { UserGroupRoleAssignmentService } from '../services/user-group-role-assignment.service';

@ApiTags('Admin User Group Roles')
@ApiBearerAuth()
@Controller('user-groups')
export class UserGroupRoleController {
  constructor(
    private readonly roleAssignmentService: UserGroupRoleAssignmentService,
    private readonly impactService: UserGroupImpactService,
  ) {}

  @Get(':id/roles')
  @ApiOperation({ summary: 'Get all platform roles assigned to a user group' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User Group UUID' })
  @ApiResponse({ status: 200, type: [AssignedRoleItemDto] })
  @ApiResponse({ status: 404, description: 'User group not found' })
  async getAssignedRoles(@Param('id', ParseUUIDPipe) id: string): Promise<AssignedRoleItemDto[]> {
    return this.roleAssignmentService.getAssignedRoles(id);
  }

  @Post(':id/roles/impact-estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Estimate affected user count and zero-role edge cases before saving role assignments',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User Group UUID' })
  @ApiResponse({ status: 200, type: RoleAssignmentImpactEstimateDto })
  @ApiResponse({ status: 404, description: 'User group not found' })
  async estimateImpact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EstimateRoleAssignmentImpactDto,
  ): Promise<RoleAssignmentImpactEstimateDto> {
    return this.impactService.estimateRoleAssignmentImpact(id, dto.roleIds);
  }

  @Put(':id/roles')
  @ApiOperation({ summary: 'Assign, replace, or unassign roles on a user group' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User Group UUID' })
  @ApiResponse({ status: 200, type: [AssignedRoleItemDto] })
  @ApiResponse({ status: 400, description: 'Validation error or invalid role IDs' })
  @ApiResponse({ status: 404, description: 'User group or role not found' })
  @ApiResponse({ status: 409, description: 'Optimistic concurrency version conflict' })
  @ApiResponse({ status: 422, description: 'High-impact confirmation required' })
  async updateRoleAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserGroupRolesDto,
  ): Promise<AssignedRoleItemDto[]> {
    return this.roleAssignmentService.updateRoleAssignments(id, dto);
  }
}
