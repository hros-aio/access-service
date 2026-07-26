/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserRepository } from './user.repository';
import { User } from '../entities/user.entity';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    const mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);

    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find user by email with tenant scope', async () => {
    const user = new User();
    user.normalizedEmail = 'test@example.com';
    user.tenantCode = 'TENANT_A';

    mockTypeormRepository.findOne.mockResolvedValue(user);

    const result = await repository.findByEmail('TEST@example.com');
    expect(result).toEqual(user);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: {
        normalizedEmail: 'test@example.com',
        tenantCode: 'TENANT_A',
      },
    });
  });

  it('should find user by employee reference ID with tenant scope', async () => {
    const user = new User();
    user.employeeRefId = 'emp-uuid';
    user.tenantCode = 'TENANT_A';

    mockTypeormRepository.findOne.mockResolvedValue(user);

    const result = await repository.findByEmployeeId('emp-uuid');
    expect(result).toEqual(user);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: {
        employeeRefId: 'emp-uuid',
        tenantCode: 'TENANT_A',
      },
    });
  });
});
