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
  EstimateScopeImpactDto,
  ScopeImpactEstimateDto,
  UpdateUserGroupScopeDto,
  UserGroupScopeDetailsDto,
} from '../dto';
import { UserGroupImpactService } from '../services/user-group-impact.service';
import { UserGroupScopeService } from '../services/user-group-scope.service';

@ApiTags('Admin User Group Scope')
@ApiBearerAuth()
@Controller('user-groups')
export class UserGroupScopeController {
  constructor(
    private readonly scopeService: UserGroupScopeService,
    private readonly impactService: UserGroupImpactService,
  ) {}

  @Get(':id/scope')
  @ApiOperation({ summary: 'Get current organizational scope configuration for a user group' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User Group UUID' })
  @ApiResponse({ status: 200, type: UserGroupScopeDetailsDto })
  @ApiResponse({ status: 404, description: 'User group not found' })
  async getScope(@Param('id', ParseUUIDPipe) id: string): Promise<UserGroupScopeDetailsDto> {
    return this.scopeService.getScope(id);
  }

  @Post(':id/scope/impact-estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Estimate blast radius and affected user population before updating scope',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User Group UUID' })
  @ApiResponse({ status: 200, type: ScopeImpactEstimateDto })
  @ApiResponse({ status: 400, description: 'Invalid scope type or missing reference ID' })
  @ApiResponse({ status: 404, description: 'User group not found' })
  async estimateImpact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EstimateScopeImpactDto,
  ): Promise<ScopeImpactEstimateDto> {
    return this.impactService.estimateScopeImpact(id, dto.scopeType, dto.scopeRefId);
  }

  @Put(':id/scope')
  @ApiOperation({ summary: 'Update organizational scope boundary of a user group' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User Group UUID' })
  @ApiResponse({ status: 200, type: UserGroupScopeDetailsDto })
  @ApiResponse({ status: 400, description: 'Validation error or invalid scope parameters' })
  @ApiResponse({ status: 404, description: 'User group not found' })
  @ApiResponse({ status: 409, description: 'Optimistic concurrency version conflict' })
  @ApiResponse({ status: 422, description: 'High-impact confirmation required' })
  async updateScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserGroupScopeDto,
  ): Promise<UserGroupScopeDetailsDto> {
    return this.scopeService.updateScope(id, dto);
  }
}
