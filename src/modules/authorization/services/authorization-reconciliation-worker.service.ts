import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { DistributedLockAdapter } from './distributed-lock.adapter';
import { EffectiveRoleProjectionService } from './effective-role-projection.service';
import { GenerateAuthzWorkerLockKey } from '../../../constants';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { RoleRepository } from '../../roles/repositories/role.repository';
import { UserGroupRepository } from '../../user-groups/repositories/user-group.repository';
import { MembershipReconciler } from '../../user-groups/services/membership-reconciler.service';
import { UserGroupMatchingEngine } from '../../user-groups/services/user-group-matching.engine';
import { AuthorizationSyncJob, SyncSourceType } from '../entities/authorization-sync-job.entity';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

@Injectable()
export class AuthorizationReconciliationWorker {
  private readonly logger = new Logger(AuthorizationReconciliationWorker.name);
  private readonly batchSize = 500;

  constructor(
    private readonly syncJobRepo: AuthorizationSyncJobRepository,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly roleRepo: RoleRepository,
    private readonly employeeRepo: EmployeeReferenceRepository,
    private readonly userGroupMatchingEngine: UserGroupMatchingEngine,
    private readonly membershipReconciler: MembershipReconciler,
    private readonly effectiveRoleProjectionService: EffectiveRoleProjectionService,
    private readonly outboxRepo: AuthSecurityEventOutboxRepository,
    private readonly transactionService: TransactionService,
    private readonly lockAdapter: DistributedLockAdapter,
  ) {}

  async processNextJob(): Promise<boolean> {
    const job = await this.syncJobRepo.claimNextPendingJob();
    if (!job) {
      return false;
    }

    const lockKey = GenerateAuthzWorkerLockKey(job.tenantCode);
    const acquired = await this.lockAdapter.acquireLock(lockKey);
    if (!acquired) {
      this.logger.debug(
        `Another worker is currently processing jobs for tenant ${job.tenantCode}. Reclaiming job ${job.id} to PENDING.`,
      );
      // Revert status back to PENDING so other cycles / workers can pick it up
      await this.syncJobRepo.reclaimStuckJob(job.id, job.retryCount ?? 0);
      return false;
    }

    try {
      try {
        await this.executeJob(job);
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Error processing sync job ${job.id}: ${err.message}`, err.stack);
        await this.handleJobFailure(job, err);
      }

      return true;
    } finally {
      await this.lockAdapter.releaseLock(lockKey);
    }
  }

  private async executeJob(job: AuthorizationSyncJob): Promise<void> {
    this.logger.log(
      `Starting authorization sync job ${job.id} for tenant ${job.tenantCode}, ${job.sourceType}:${job.sourceId} (version ${job.sourceVersion})`,
    );

    // 1. Fetch total employees for tenant
    const totalEmployees = await this.employeeRepo.countEmployeesByTenant(job.tenantCode);
    await this.syncJobRepo.updateProgress(job.id, 0, totalEmployees);

    // 2. If User Group sync, perform dynamic matching and membership reconciliation
    if (job.sourceType === SyncSourceType.USER_GROUP) {
      const group = await this.userGroupRepo.findByTenantAndId(job.tenantCode, job.sourceId);
      if (group && group.matchingRule) {
        const { sql, params } = this.userGroupMatchingEngine.buildMatchingQuery(
          job.tenantCode,
          group.matchingRule,
        );
        const rows = await this.transactionService.getManager().query(sql, params);
        const matchedEmployeeIds = (rows || []).map((r: { employee_id: string }) => r.employee_id);
        await this.membershipReconciler.reconcileGroupPopulation(
          job.tenantCode,
          job.sourceId,
          matchedEmployeeIds,
          job.sourceVersion,
        );
      }
    }

    // 3. Process employees in bounded batches
    let processed = 0;
    while (processed < totalEmployees) {
      const employees = await this.employeeRepo.findEmployeesBatch(
        job.tenantCode,
        processed,
        this.batchSize,
      );
      if (!employees || employees.length === 0) {
        break;
      }

      for (const employee of employees) {
        await this.effectiveRoleProjectionService.recomputeUserEffectiveRoles(
          job.tenantCode,
          employee.employeeId,
        );
      }

      processed += employees.length;
      await this.syncJobRepo.updateProgress(job.id, processed, totalEmployees);
    }

    // 4. Finalize job & advance projection_version in a single transaction
    await this.transactionService.runInTransaction(async () => {
      // Advance projection version on source entity
      if (job.sourceType === SyncSourceType.USER_GROUP) {
        await this.userGroupRepo.updateProjectionVersion(
          job.tenantCode,
          job.sourceId,
          job.sourceVersion,
        );
      } else if (job.sourceType === SyncSourceType.ROLE) {
        await this.roleRepo
          .updateProjectionVersion(job.tenantCode, job.sourceId, job.sourceVersion)
          .catch(() => undefined);
      }

      // Mark job completed
      await this.syncJobRepo.markCompleted(job.id, processed);

      // Append outbox event for sync completion
      const outboxEvent = AuthSecurityEventOutbox.fromAuthorizationSyncCompleted(
        { tenantCode: job.tenantCode, userId: job.createdBy ?? undefined },
        {
          jobId: job.id,
          sourceType: job.sourceType,
          sourceId: job.sourceId,
          sourceVersion: job.sourceVersion,
          triggerType: job.triggerType,
          totalUsers: totalEmployees,
          processedUsers: processed,
          initiatedBy: job.createdBy,
        },
      );
      await this.outboxRepo.create(outboxEvent);
    });

    this.logger.log(
      `Successfully completed sync job ${job.id} for tenant ${job.tenantCode}. Total processed users: ${processed}`,
    );
  }

  private async handleJobFailure(job: AuthorizationSyncJob, error: Error): Promise<void> {
    const errorDetails = {
      message: error?.message || 'Unknown synchronization failure',
      stack: error?.stack,
    };

    await this.transactionService.runInTransaction(async () => {
      await this.syncJobRepo.markFailed(job.id, errorDetails);

      const outboxEvent = AuthSecurityEventOutbox.fromAuthorizationSyncFailed(
        { tenantCode: job.tenantCode, userId: job.createdBy ?? undefined },
        {
          jobId: job.id,
          sourceType: job.sourceType,
          sourceId: job.sourceId,
          sourceVersion: job.sourceVersion,
          triggerType: job.triggerType,
          totalUsers: job.totalUsers ?? 0,
          processedUsers: job.processedUsers,
          errorDetails,
          initiatedBy: job.createdBy,
        },
      );
      await this.outboxRepo.create(outboxEvent);
    });
  }
}
