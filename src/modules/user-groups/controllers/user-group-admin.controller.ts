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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  CreateUserGroupDto,
  LifecycleTransitionDto,
  PaginatedUserGroupDto,
  UpdateUserGroupDto,
  UserGroupDetailsDto,
  UserGroupQueryDto,
} from '../dto';
import { UserGroupLifecycleService } from '../services/user-group-lifecycle.service';
import { UserGroupQueryService } from '../services/user-group-query.service';

@ApiTags('Admin User Groups')
@ApiBearerAuth()
@Controller('admin/user-groups')
export class UserGroupAdminController {
  constructor(
    private readonly userGroupLifecycleService: UserGroupLifecycleService,
    private readonly userGroupQueryService: UserGroupQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List user groups for the authenticated tenant' })
  @ApiResponse({ status: 200, type: PaginatedUserGroupDto })
  async listUserGroups(@Query() query: UserGroupQueryDto): Promise<PaginatedUserGroupDto> {
    return this.userGroupQueryService.listUserGroups(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a dynamic user group' })
  @ApiResponse({ status: 201, type: UserGroupDetailsDto })
  @ApiResponse({ status: 400, description: 'Invalid matching rule or scope configuration' })
  @ApiResponse({ status: 409, description: 'Duplicate user group name in tenant' })
  async createUserGroup(@Body() dto: CreateUserGroupDto): Promise<UserGroupDetailsDto> {
    const group = await this.userGroupLifecycleService.createUserGroup(dto);
    return this.userGroupQueryService.getUserGroupById(group.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user group details by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserGroupDetailsDto })
  @ApiResponse({ status: 404, description: 'User group not found' })
  async getUserGroupById(@Param('id', ParseUUIDPipe) id: string): Promise<UserGroupDetailsDto> {
    return this.userGroupQueryService.getUserGroupById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user group configuration and role assignments' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserGroupDetailsDto })
  @ApiResponse({ status: 400, description: 'Validation error in matching rule or scope' })
  @ApiResponse({ status: 404, description: 'User group not found' })
  @ApiResponse({ status: 409, description: 'Optimistic concurrency conflict or duplicate name' })
  async updateUserGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserGroupDto,
  ): Promise<UserGroupDetailsDto> {
    const group = await this.userGroupLifecycleService.updateUserGroup(id, dto, dto.version);
    return this.userGroupQueryService.getUserGroupById(group.id);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate an active user group' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserGroupDetailsDto })
  @ApiResponse({ status: 404, description: 'User group not found' })
  @ApiResponse({ status: 409, description: 'Version conflict or invalid state transition' })
  async deactivateUserGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LifecycleTransitionDto,
  ): Promise<UserGroupDetailsDto> {
    const group = await this.userGroupLifecycleService.deactivateUserGroup(id, dto.version);
    return this.userGroupQueryService.getUserGroupById(group.id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate an inactive user group' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserGroupDetailsDto })
  @ApiResponse({ status: 404, description: 'User group not found' })
  @ApiResponse({ status: 409, description: 'Version conflict or invalid state transition' })
  async reactivateUserGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LifecycleTransitionDto,
  ): Promise<UserGroupDetailsDto> {
    const group = await this.userGroupLifecycleService.reactivateUserGroup(id, dto.version);
    return this.userGroupQueryService.getUserGroupById(group.id);
  }
}
