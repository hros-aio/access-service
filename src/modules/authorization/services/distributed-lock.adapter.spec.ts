import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { DistributedLockAdapter } from './distributed-lock.adapter';

describe('DistributedLockAdapter', () => {
  let adapter: DistributedLockAdapter;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockEntityManager: { query: jest.Mock };

  beforeEach(async () => {
    mockEntityManager = {
      query: jest.fn(),
    };

    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
      runInTransaction: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributedLockAdapter,
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    adapter = module.get<DistributedLockAdapter>(DistributedLockAdapter);
  });

  it('should acquire lock successfully when pg_try_advisory_lock returns true', async () => {
    mockEntityManager.query.mockResolvedValueOnce([{ acquired: true }]);

    const result = await adapter.acquireLock('authz:scheduled_reconciliation');

    expect(result).toBe(true);
    expect(mockEntityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT pg_try_advisory_lock'),
      [expect.any(String)],
    );
  });

  it('should return false when pg_try_advisory_lock returns false (lock contention)', async () => {
    mockEntityManager.query.mockResolvedValueOnce([{ acquired: false }]);

    const result = await adapter.acquireLock('authz:scheduled_reconciliation');

    expect(result).toBe(false);
  });

  it('should catch errors gracefully and return false when acquisition fails', async () => {
    mockEntityManager.query.mockRejectedValueOnce(new Error('DB Connection Error'));

    const result = await adapter.acquireLock('authz:scheduled_reconciliation');

    expect(result).toBe(false);
  });

  it('should release lock successfully when pg_advisory_unlock returns true', async () => {
    mockEntityManager.query.mockResolvedValueOnce([{ released: true }]);

    const result = await adapter.releaseLock('authz:scheduled_reconciliation');

    expect(result).toBe(true);
    expect(mockEntityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT pg_advisory_unlock'),
      [expect.any(String)],
    );
  });

  it('should catch errors gracefully and return false when release fails', async () => {
    mockEntityManager.query.mockRejectedValueOnce(new Error('DB Release Error'));

    const result = await adapter.releaseLock('authz:scheduled_reconciliation');

    expect(result).toBe(false);
  });
});
