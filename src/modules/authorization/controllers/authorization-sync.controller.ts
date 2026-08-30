import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import { TriggerSyncNowDto } from '../dto/trigger-sync-now.dto';
import { AuthorizationGuard, RequirePermissions } from '../guards/authorization.guard';
import { AuthorizationSyncService } from '../services/authorization-sync.service';

@ApiTags('Authorization Sync')
@ApiBearerAuth()
@UseGuards(AuthorizationGuard)
@Controller('authz')
export class AuthorizationSyncController {
  constructor(private readonly syncService: AuthorizationSyncService) {}

  @Post('sync-now')
  @RequirePermissions('user_group.sync', 'role.sync')
  @ApiOperation({ summary: 'Trigger on-demand synchronization for Role or User Group' })
  @ApiResponse({
    status: 200,
    description: 'Sync job triggered, existing job returned, or no-op completed',
    type: SyncJobResponseDto,
  })
  async triggerSyncNow(@Body() dto: TriggerSyncNowDto): Promise<SyncJobResponseDto> {
    return this.syncService.requestSyncNow(dto);
  }

  @Get('sync-jobs/:jobId')
  @RequirePermissions('user_group.read', 'role.read')
  @ApiOperation({ summary: 'Retrieve status and progress of a synchronization job' })
  @ApiResponse({
    status: 200,
    description: 'Sync job status and progress details',
    type: SyncJobResponseDto,
  })
  async getSyncJobStatus(@Param('jobId') jobId: string): Promise<SyncJobResponseDto> {
    return this.syncService.getJobStatus(jobId);
  }
}
