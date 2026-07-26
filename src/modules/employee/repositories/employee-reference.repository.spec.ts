/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { EmployeeReferenceRepository } from './employee-reference.repository';
import { EmployeeReference } from '../entities/employee-reference.entity';

describe('EmployeeReferenceRepository', () => {
  let repository: EmployeeReferenceRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    const mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeReferenceRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<EmployeeReferenceRepository>(EmployeeReferenceRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find employee reference by ID', async () => {
    const emp = new EmployeeReference();
    emp.tenantCode = 'TENANT_A';
    emp.employeeId = 'emp-uuid';

    mockTypeormRepository.findOne.mockResolvedValue(emp);

    const result = await repository.findById('emp-uuid');
    expect(result).toEqual(emp);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { employeeId: 'emp-uuid' },
    });
  });

  it('should save employee reference', async () => {
    const emp = new EmployeeReference();
    mockTypeormRepository.save.mockResolvedValue(emp);

    const result = await repository.save(emp);
    expect(result).toEqual(emp);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(emp);
  });
});
