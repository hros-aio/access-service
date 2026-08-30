import { ScheduledReconciliationMetrics } from './scheduled-reconciliation.metrics';

describe('ScheduledReconciliationMetrics', () => {
  let metrics: ScheduledReconciliationMetrics;

  beforeEach(() => {
    metrics = new ScheduledReconciliationMetrics();
  });

  it('should record sweep duration', () => {
    metrics.recordSweepDuration(1.45);
    expect(metrics.getSnapshot().lastSweepDurationSeconds).toBe(1.45);
  });

  it('should increment dirty entities discovered by source type', () => {
    metrics.incrementDirtyEntitiesDiscovered('USER_GROUP', 5);
    metrics.incrementDirtyEntitiesDiscovered('ROLE', 2);
    metrics.incrementDirtyEntitiesDiscovered('USER_GROUP', 3);

    const snapshot = metrics.getSnapshot();
    expect(snapshot.dirtyEntitiesDiscovered['USER_GROUP']).toBe(8);
    expect(snapshot.dirtyEntitiesDiscovered['ROLE']).toBe(2);
  });

  it('should increment tenants scanned', () => {
    metrics.incrementTenantsScanned(10);
    metrics.incrementTenantsScanned(5);

    expect(metrics.getSnapshot().tenantsScannedTotal).toBe(15);
  });

  it('should increment lock acquisitions status', () => {
    metrics.incrementLockAcquisitions('acquired');
    metrics.incrementLockAcquisitions('contended_skipped');
    metrics.incrementLockAcquisitions('contended_skipped');

    const snapshot = metrics.getSnapshot();
    expect(snapshot.lockAcquisitions['acquired']).toBe(1);
    expect(snapshot.lockAcquisitions['contended_skipped']).toBe(2);
    expect(snapshot.lockAcquisitions['failed']).toBe(0);
  });
});
