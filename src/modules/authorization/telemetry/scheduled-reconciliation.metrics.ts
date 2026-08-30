import { Injectable } from '@nestjs/common';

export interface IScheduledReconciliationMetrics {
  recordSweepDuration(seconds: number): void;
  incrementDirtyEntitiesDiscovered(sourceType: string, count?: number): void;
  incrementTenantsScanned(count?: number): void;
  incrementLockAcquisitions(status: 'acquired' | 'contended_skipped' | 'failed'): void;
}

@Injectable()
export class ScheduledReconciliationMetrics implements IScheduledReconciliationMetrics {
  // In a full prometheus environment, these delegates to prom-client gauges/counters
  private lockAcquisitions: Record<string, number> = {
    acquired: 0,
    contended_skipped: 0,
    failed: 0,
  };
  private tenantsScannedTotal = 0;
  private dirtyEntitiesDiscovered: Record<string, number> = {};
  private lastSweepDurationSeconds = 0;

  recordSweepDuration(seconds: number): void {
    this.lastSweepDurationSeconds = seconds;
  }

  incrementDirtyEntitiesDiscovered(sourceType: string, count = 1): void {
    this.dirtyEntitiesDiscovered[sourceType] =
      (this.dirtyEntitiesDiscovered[sourceType] || 0) + count;
  }

  incrementTenantsScanned(count = 1): void {
    this.tenantsScannedTotal += count;
  }

  incrementLockAcquisitions(status: 'acquired' | 'contended_skipped' | 'failed'): void {
    this.lockAcquisitions[status] = (this.lockAcquisitions[status] || 0) + 1;
  }

  getSnapshot(): {
    lockAcquisitions: Record<string, number>;
    tenantsScannedTotal: number;
    dirtyEntitiesDiscovered: Record<string, number>;
    lastSweepDurationSeconds: number;
  } {
    return {
      lockAcquisitions: { ...this.lockAcquisitions },
      tenantsScannedTotal: this.tenantsScannedTotal,
      dirtyEntitiesDiscovered: { ...this.dirtyEntitiesDiscovered },
      lastSweepDurationSeconds: this.lastSweepDurationSeconds,
    };
  }
}
