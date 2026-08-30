import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

export interface IDistributedLockAdapter {
  acquireLock(lockKey: string): Promise<boolean>;
  releaseLock(lockKey: string): Promise<boolean>;
}

@Injectable()
export class DistributedLockAdapter implements IDistributedLockAdapter {
  private readonly logger = new Logger(DistributedLockAdapter.name);

  constructor(private readonly transactionService: TransactionService) {}

  /**
   * Derives a deterministic 64-bit integer from a string lock key for PostgreSQL advisory locks.
   */
  private hashKeyToInt64(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Convert to positive 64-bit integer representation string
    return Math.abs(hash).toString();
  }

  /**
   * Attempts to acquire a session-level PostgreSQL advisory lock.
   * Returns true if lock was acquired, false if contended by another process.
   */
  async acquireLock(lockKey: string): Promise<boolean> {
    const lockId = this.hashKeyToInt64(lockKey);
    try {
      const result = await this.transactionService
        .getManager()
        .query(`SELECT pg_try_advisory_lock($1) AS acquired`, [lockId]);

      const acquired = Boolean(result?.[0]?.acquired);
      if (acquired) {
        this.logger.debug(
          `Successfully acquired distributed advisory lock for '${lockKey}' (id=${lockId})`,
        );
      } else {
        this.logger.debug(
          `Failed to acquire distributed advisory lock for '${lockKey}' (contended, id=${lockId})`,
        );
      }
      return acquired;
    } catch (error) {
      this.logger.error(`Error attempting to acquire distributed lock for '${lockKey}'`, error);
      return false;
    }
  }

  /**
   * Releases a session-level PostgreSQL advisory lock.
   */
  async releaseLock(lockKey: string): Promise<boolean> {
    const lockId = this.hashKeyToInt64(lockKey);
    try {
      const result = await this.transactionService
        .getManager()
        .query(`SELECT pg_advisory_unlock($1) AS released`, [lockId]);

      const released = Boolean(result?.[0]?.released);
      if (released) {
        this.logger.debug(
          `Successfully released distributed advisory lock for '${lockKey}' (id=${lockId})`,
        );
      } else {
        this.logger.warn(
          `Advisory lock for '${lockKey}' was not held during release attempt (id=${lockId})`,
        );
      }
      return released;
    } catch (error) {
      this.logger.error(`Error attempting to release distributed lock for '${lockKey}'`, error);
      return false;
    }
  }
}
