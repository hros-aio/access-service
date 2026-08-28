import { TransactionService } from '@new-hros/libs-sql';

import { EmployeeReferenceRepository } from './employee-reference.repository';

describe('EmployeeReferenceRepository', () => {
  let repository: EmployeeReferenceRepository;
  let mockManager: { getRepository: jest.Mock; query: jest.Mock };
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockTypeormRepo: { save: jest.Mock; findOne: jest.Mock; count: jest.Mock };

  beforeEach(() => {
    mockTypeormRepo = {
      save: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };
    mockManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepo),
      query: jest.fn(),
    };
    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockManager),
    } as unknown as jest.Mocked<TransactionService>;
    repository = new EmployeeReferenceRepository(mockTransactionService);
  });

  it('upsertProjection executes raw SQL and returns true on conflict update', async () => {
    mockManager.query.mockResolvedValueOnce([{ employee_id: 'emp-1' }]);

    const result = await repository.upsertProjection({
      employeeId: 'emp-1',
      tenantCode: 'DEFAULT',
      employeeCode: 'EMP001',
      departmentId: 'dept-1',
      sourceVersion: 5,
    });

    expect(result).toBe(true);
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_code, employee_id) DO UPDATE'),
      expect.arrayContaining(['emp-1', 'DEFAULT', 'EMP001', 5]),
    );
  });

  it('updateReporteesCount updates reportees count with GREATEST(0, ...)', async () => {
    mockManager.query.mockResolvedValueOnce([]);

    await repository.updateReporteesCount('DEFAULT', 'mgr-1', 1);

    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('reportees_count = GREATEST(0, reportees_count + $1)'),
      [1, 'DEFAULT', 'mgr-1'],
    );
  });
});
