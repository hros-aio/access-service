/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthenticationSettingsRepository } from './authentication-settings.repository';
import { AuthenticationSettings } from '../entities/authentication-settings.entity';

describe('AuthenticationSettingsRepository', () => {
  let repository: AuthenticationSettingsRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      create: jest.fn().mockImplementation((data) => data),
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
        AuthenticationSettingsRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<AuthenticationSettingsRepository>(AuthenticationSettingsRepository);

    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find settings by tenant code with tenant scope', async () => {
    const settings = new AuthenticationSettings();
    settings.tenantCode = 'TENANT_A';

    mockTypeormRepository.findOne.mockResolvedValue(settings);

    const result = await repository.findByTenantCode('TENANT_A');
    expect(result).toEqual(settings);
    expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
      where: {
        tenantCode: 'TENANT_A',
      },
    });
  });
});
