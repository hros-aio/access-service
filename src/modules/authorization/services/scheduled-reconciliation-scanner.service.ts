import { Injectable, Logger } from '@nestjs/common';

import { AuthorizationSyncService } from './authorization-sync.service';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { SyncSourceType, SyncTriggerType } from '../entities/authorization-sync-job.entity';
import { ScheduledReconciliationMetrics } from '../telemetry/scheduled-reconciliation.metrics';

@Injectable()
export class ScheduledReconciliationScanner {
  private readonly logger = new Logger(ScheduledReconciliationScanner.name);

  constructor(
    private readonly userGroupRepo: UserGroupRepository,
    private readonly roleRepo: RoleRepository,
    private readonly syncService: AuthorizationSyncService,
    private readonly metrics: ScheduledReconciliationMetrics,
  ) {}

  /**
   * Main scheduled execution entry point.
   * Can be wired to NestJS @Cron or invoked directly by tests/runners.
   */
  async handleCron(): Promise<{
    lockAcquired: boolean;
    tenantsScanned: number;
    dirtyGroupsFound: number;
    dirtyRolesFound: number;
    jobsEnqueued: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    this.logger.log('Starting dirty authorization entity sweep.');

    let tenantsScanned = 0;
    let dirtyGroupsFound = 0;
    let dirtyRolesFound = 0;
    let jobsEnqueued = 0;

    try {
      // 1. Discover dirty entities across tenants
      const dirtyGroups = await this.userGroupRepo.findDirtyUserGroups();
      dirtyGroupsFound = dirtyGroups.length;
      if (dirtyGroupsFound > 0) {
        this.metrics.incrementDirtyEntitiesDiscovered('USER_GROUP', dirtyGroupsFound);
      }

      const dirtyRoles = await this.roleRepo.findDirtyRoles();
      dirtyRolesFound = dirtyRoles.length;
      if (dirtyRolesFound > 0) {
        this.metrics.incrementDirtyEntitiesDiscovered('ROLE', dirtyRolesFound);
      }

      // 2. Aggregate unique tenants
      const tenantSet = new Set<string>();
      dirtyGroups.forEach((g) => tenantSet.add(g.tenantCode));
      dirtyRoles.forEach((r) => tenantSet.add(r.tenantCode));
      tenantsScanned = tenantSet.size;
      this.metrics.incrementTenantsScanned(tenantsScanned);

      // 3. Process per tenant
      for (const tenantCode of tenantSet) {
        const tenantGroups = dirtyGroups.filter((g) => g.tenantCode === tenantCode);
        const tenantRoles = dirtyRoles.filter((r) => r.tenantCode === tenantCode);
        const enqueued = await this.handleByTenant(tenantCode, {
          groups: tenantGroups,
          roles: tenantRoles,
        });
        jobsEnqueued += enqueued;
      }

      const durationMs = Date.now() - startTime;
      this.metrics.recordSweepDuration(durationMs / 1000);

      this.logger.log(
        JSON.stringify({
          message: 'Scheduled authorization reconciliation sweep completed',
          durationMs,
          tenantsScanned,
          dirtyGroupsFound,
          dirtyRolesFound,
          jobsEnqueued,
        }),
      );

      return {
        lockAcquired: true,
        tenantsScanned,
        dirtyGroupsFound,
        dirtyRolesFound,
        jobsEnqueued,
        durationMs,
      };
    } catch (error) {
      this.logger.error('Unexpected error during scheduled reconciliation sweep', error);
      throw error;
    }
  }

  /**
   * Process dirty entities for a single tenant.
   * Isolates failures and returns number of enqueued jobs.
   */
  async handleByTenant(
    tenantCode: string,
    dirty: {
      groups?: { id: string; version: number }[];
      roles?: { id: string; version: number }[];
    },
  ): Promise<number> {
    let jobsEnqueued = 0;

    if (dirty.groups && dirty.groups.length > 0) {
      for (const group of dirty.groups) {
        try {
          const response = await this.syncService.enqueueSyncJob({
            tenantCode,
            sourceType: SyncSourceType.USER_GROUP,
            sourceId: group.id,
            sourceVersion: group.version,
            triggerType: SyncTriggerType.SCHEDULED,
            createdBy: 'SYSTEM',
            ignoreValidateSource: true,
          });
          if (response.jobId) {
            jobsEnqueued++;
          }
        } catch (err) {
          this.logger.error(
            `Failed to enqueue scheduled sync for user group ${group.id} in tenant ${tenantCode}`,
            err,
          );
        }
      }
    }

    if (dirty.roles && dirty.roles.length > 0) {
      for (const role of dirty.roles) {
        try {
          const response = await this.syncService.enqueueSyncJob({
            tenantCode,
            sourceType: SyncSourceType.ROLE,
            sourceId: role.id,
            sourceVersion: role.version,
            triggerType: SyncTriggerType.SCHEDULED,
            createdBy: 'SYSTEM',
            ignoreValidateSource: true,
          });
          if (response.jobId) {
            jobsEnqueued++;
          }
        } catch (err) {
          this.logger.error(
            `Failed to enqueue scheduled sync for role ${role.id} in tenant ${tenantCode}`,
            err,
          );
        }
      }
    }

    return jobsEnqueued;
  }
}
