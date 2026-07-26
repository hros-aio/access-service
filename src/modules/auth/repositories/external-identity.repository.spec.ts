/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { ExternalIdentityRepository } from './external-identity.repository';
import { ExternalIdentity } from '../entities/external-identity.entity';

describe('ExternalIdentityRepository', () => {
  let repository: ExternalIdentityRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    const mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalIdentityRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<ExternalIdentityRepository>(ExternalIdentityRepository);

    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find external identity by provider and subject with tenant scope', async () => {
    const identity = new ExternalIdentity();
    identity.provider = 'google';
    identity.providerSubject = 'sub-123';
    identity.tenantCode = 'TENANT_A';

    mockTypeormRepository.findOne.mockResolvedValue(identity);

    const result = await repository.findByProviderSubject('google', 'sub-123');
    expect(result).toEqual(identity);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: {
        provider: 'google',
        providerSubject: 'sub-123',
        tenantCode: 'TENANT_A',
      },
    });
  });

  it('should find external identities by user ID with tenant scope', async () => {
    const identities = [new ExternalIdentity()];
    mockTypeormRepository.find.mockResolvedValue(identities);

    const result = await repository.findByUserId('user-uuid');
    expect(result).toEqual(identities);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: {
        userId: 'user-uuid',
        tenantCode: 'TENANT_A',
      },
    });
  });
});
