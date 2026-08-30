import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { AuthorizationSyncJobRepository } from '../repositories/authorization-sync-job.repository';

@Injectable()
export class SyncJobWatchdogService {
  private readonly logger = new Logger(SyncJobWatchdogService.name);
  private readonly maxRetries = 3;
  private readonly timeoutMinutes = 10;

  constructor(
    private readonly syncJobRepo: AuthorizationSyncJobRepository,
    private readonly outboxRepo: AuthSecurityEventOutboxRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async checkAndReclaimStuckJobs(): Promise<number> {
    const stuckJobs = await this.syncJobRepo.findStuckProcessingJobs(this.timeoutMinutes);
    if (!stuckJobs || stuckJobs.length === 0) {
      return 0;
    }

    this.logger.warn(`Found ${stuckJobs.length} stuck PROCESSING sync jobs`);
    let recoveredCount = 0;

    for (const job of stuckJobs) {
      const nextRetryCount = job.retryCount + 1;

      if (nextRetryCount <= this.maxRetries) {
        this.logger.log(
          `Reclaiming stuck job ${job.id} (attempt ${nextRetryCount}/${this.maxRetries}) back to PENDING`,
        );
        await this.syncJobRepo.reclaimStuckJob(job.id, nextRetryCount);
        recoveredCount++;
      } else {
        this.logger.error(
          `Stuck job ${job.id} exceeded max recovery retries (${this.maxRetries}). Marking as FAILED.`,
        );
        const errorDetails = {
          message: `Job exceeded watchdog timeout of ${this.timeoutMinutes} minutes after ${this.maxRetries} recovery attempts`,
          code: 'WATCHDOG_TIMEOUT',
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
        recoveredCount++;
      }
    }

    return recoveredCount;
  }
}
