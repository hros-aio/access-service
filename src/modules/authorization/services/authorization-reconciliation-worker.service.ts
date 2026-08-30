import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { EffectiveRoleProjectionService } from './effective-role-projection.service';
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
  private isRunning = false;
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
  ) {}

  async processNextJob(): Promise<boolean> {
    if (this.isRunning) {
      return false;
    }

    const job = await this.syncJobRepo.claimNextPendingJob();
    if (!job) {
      return false;
    }

    this.isRunning = true;
    try {
      await this.executeJob(job);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error processing sync job ${job.id}: ${err.message}`, err.stack);
      await this.handleJobFailure(job, err);
    } finally {
      this.isRunning = false;
    }

    return true;
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
        // Update projection version on role if repository supports it
        await this.transactionService
          .getManager()
          .query(`UPDATE roles SET projection_version = $1 WHERE id = $2 AND tenant_code = $3`, [
            job.sourceVersion,
            job.sourceId,
            job.tenantCode,
          ])
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
