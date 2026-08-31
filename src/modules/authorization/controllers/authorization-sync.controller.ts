import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequestContextService } from '@new-hros/libs-core';

import { SyncJobResponseDto } from '../dto/sync-job-response.dto';
import { SyncStatusResponseDto } from '../dto/sync-status-response.dto';
import { SyncStatusSummaryResponseDto } from '../dto/sync-status-summary-response.dto';
import { TriggerSyncNowDto } from '../dto/trigger-sync-now.dto';
import { SyncSourceType } from '../entities/authorization-sync-job.entity';
import { AuthorizationGuard, RequirePermissions } from '../guards/authorization.guard';
import { AuthorizationSyncService } from '../services/authorization-sync.service';
import { ScheduledReconciliationScanner } from '../services/scheduled-reconciliation-scanner.service';
import { SyncStatusProjectionService } from '../services/sync-status-projection.service';

@ApiTags('Authorization Sync')
@ApiBearerAuth()
@UseGuards(AuthorizationGuard)
@Controller('authz')
export class AuthorizationSyncController {
  constructor(
    private readonly syncService: AuthorizationSyncService,
    private readonly scanner: ScheduledReconciliationScanner,
    private readonly projectionService: SyncStatusProjectionService,
  ) {}

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
  @RequirePermissions('user_group.read', 'role.read', 'user_group.view', 'role.view')
  @ApiOperation({ summary: 'Retrieve status and progress of a synchronization job' })
  @ApiResponse({
    status: 200,
    description: 'Sync job status and progress details',
    type: SyncJobResponseDto,
  })
  async getSyncJobStatus(@Param('jobId') jobId: string): Promise<SyncJobResponseDto> {
    return this.syncService.getJobStatus(jobId);
  }

  @Get('sync-status/summary')
  @RequirePermissions('user_group.read', 'role.read', 'user_group.view', 'role.view')
  @ApiOperation({ summary: 'Retrieve tenant-wide synchronization summary' })
  @ApiResponse({
    status: 200,
    description: 'Tenant-wide aggregate synchronization state counts',
    type: SyncStatusSummaryResponseDto,
  })
  async getSyncStatusSummary(): Promise<SyncStatusSummaryResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }
    return this.projectionService.getTenantSummary(tenantCode);
  }

  @Get('sync-status/:sourceType/:sourceId')
  @RequirePermissions('user_group.read', 'role.read', 'user_group.view', 'role.view')
  @ApiOperation({ summary: 'Retrieve real-time synchronization status and metadata for an entity' })
  @ApiResponse({
    status: 200,
    description: 'Entity synchronization status and progress details',
    type: SyncStatusResponseDto,
  })
  async getEntitySyncStatus(
    @Param('sourceType') sourceType: SyncSourceType,
    @Param('sourceId') sourceId: string,
  ): Promise<SyncStatusResponseDto> {
    const tenantCode = RequestContextService.getTenantCode();
    if (!tenantCode) {
      throw new Error('Tenant code is missing from active RequestContext');
    }
    return this.projectionService.getEntitySyncStatus(tenantCode, sourceType, sourceId);
  }

  @Post('sync-status/:sourceType/:sourceId/retry')
  @RequirePermissions('user_group.sync', 'role.sync')
  @ApiOperation({ summary: 'Retry a failed synchronization for Role or User Group' })
  @ApiResponse({
    status: 200,
    description: 'Failed sync job retried successfully',
    type: SyncJobResponseDto,
  })
  async retryFailedSync(
    @Param('sourceType') sourceType: SyncSourceType,
    @Param('sourceId') sourceId: string,
  ): Promise<SyncJobResponseDto> {
    return this.syncService.retryFailedSync(sourceType, sourceId);
  }

  @Post('scheduled-sweep')
  @ApiOperation({
    summary: 'Trigger scheduled authorization reconciliation sweep (System / K8s CronJob only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sweep execution completed',
  })
  async triggerScheduledSweep(): Promise<{ message: string }> {
    await this.scanner.handleCron();
    return {
      message: 'Scheduled authorization reconciliation sweep executed successfully',
    };
  }
}
