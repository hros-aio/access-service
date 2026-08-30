import { Injectable, Logger } from '@nestjs/common';

import { AuthorizationSyncService } from './authorization-sync.service';
import { DistributedLockAdapter } from './distributed-lock.adapter';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { SyncSourceType, SyncTriggerType } from '../entities/authorization-sync-job.entity';
import { ScheduledReconciliationMetrics } from '../telemetry/scheduled-reconciliation.metrics';

@Injectable()
export class ScheduledReconciliationScanner {
  private readonly logger = new Logger(ScheduledReconciliationScanner.name);
  private static readonly LOCK_KEY = 'authz:scheduled_reconciliation:scanner';

  constructor(
    private readonly lockAdapter: DistributedLockAdapter,
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
    const lockAcquired = await this.lockAdapter.acquireLock(
      ScheduledReconciliationScanner.LOCK_KEY,
    );

    if (!lockAcquired) {
      this.metrics.incrementLockAcquisitions('contended_skipped');
      this.logger.log('Scheduled reconciliation skipped: lock currently held by another replica.');
      return {
        lockAcquired: false,
        tenantsScanned: 0,
        dirtyGroupsFound: 0,
        dirtyRolesFound: 0,
        jobsEnqueued: 0,
        durationMs: Date.now() - startTime,
      };
    }

    this.metrics.incrementLockAcquisitions('acquired');
    this.logger.log('Acquired scheduler lock. Starting dirty authorization entity sweep.');

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

      // 3. Process groups per tenant batch
      for (const group of dirtyGroups) {
        try {
          const response = await this.syncService.enqueueSyncJob({
            tenantCode: group.tenantCode,
            sourceType: SyncSourceType.USER_GROUP,
            sourceId: group.id,
            sourceVersion: group.version,
            triggerType: SyncTriggerType.SCHEDULED,
            createdBy: 'SYSTEM',
          });
          if (response.jobId) {
            jobsEnqueued++;
          }
        } catch (err) {
          this.logger.error(
            `Failed to enqueue scheduled sync for user group ${group.id} in tenant ${group.tenantCode}`,
            err,
          );
        }
      }

      // 4. Process roles per tenant batch
      for (const role of dirtyRoles) {
        try {
          const response = await this.syncService.enqueueSyncJob({
            tenantCode: role.tenantCode,
            sourceType: SyncSourceType.ROLE,
            sourceId: role.id,
            sourceVersion: role.version,
            triggerType: SyncTriggerType.SCHEDULED,
            createdBy: 'SYSTEM',
          });
          if (response.jobId) {
            jobsEnqueued++;
          }
        } catch (err) {
          this.logger.error(
            `Failed to enqueue scheduled sync for role ${role.id} in tenant ${role.tenantCode}`,
            err,
          );
        }
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
          lockStatus: 'acquired',
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
    } finally {
      await this.lockAdapter.releaseLock(ScheduledReconciliationScanner.LOCK_KEY);
    }
  }
}
