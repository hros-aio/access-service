/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { TenantRepository } from './tenant.repository';
import { Tenant } from '../entities/tenant.entity';

describe('TenantRepository', () => {
  let repository: TenantRepository;
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
        TenantRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<TenantRepository>(TenantRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find tenant by code', async () => {
    const tenant = new Tenant();
    tenant.tenantCode = 'TENANT_A';

    mockTypeormRepository.findOne.mockResolvedValue(tenant);

    const result = await repository.findByCode('TENANT_A');
    expect(result).toEqual(tenant);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: { tenantCode: 'TENANT_A' },
    });
  });

  it('should save tenant', async () => {
    const tenant = new Tenant();
    mockTypeormRepository.save.mockResolvedValue(tenant);

    const result = await repository.save(tenant);
    expect(result).toEqual(tenant);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(tenant);
  });
});
