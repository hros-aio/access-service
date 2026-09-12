import { TransactionService } from '@new-hros/libs-sql';

import { EmployeeReferenceRepository } from './employee-reference.repository';

import { EmployeeStatus } from '@/enums/employee-status.enum';

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

  it('findByCode searches by tenantCode and employeeCode', async () => {
    const mockEmp = { id: 'emp-1', employeeCode: 'EMP001', tenantCode: 'DEFAULT' };
    mockTypeormRepo.findOne.mockResolvedValueOnce(mockEmp);

    const result = await repository.findByCode('DEFAULT', 'EMP001');

    expect(result).toEqual(mockEmp);
    expect(mockTypeormRepo.findOne).toHaveBeenCalledWith({
      where: { tenantCode: 'DEFAULT', employeeCode: 'EMP001' },
    });
  });

  it('countEmployeesByTenant returns active employee count', async () => {
    mockTypeormRepo.count.mockResolvedValueOnce(42);

    const count = await repository.countEmployeesByTenant('DEFAULT');

    expect(count).toBe(42);
    expect(mockTypeormRepo.count).toHaveBeenCalledWith({
      where: { tenantCode: 'DEFAULT', status: EmployeeStatus.ACTIVE },
    });
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
