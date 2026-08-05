import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthenticationSettingsService } from './authentication-settings.service';
import { AuthenticationSettings } from '../entities/authentication-settings.entity';
import { AuthenticationSettingsRepository } from '../repositories/authentication-settings.repository';

describe('AuthenticationSettingsService', () => {
  let service: AuthenticationSettingsService;
  let repository: jest.Mocked<AuthenticationSettingsRepository>;

  beforeEach(async () => {
    const mockRepo = {
      findByTenantCode: jest.fn(),
      updateWithOptimisticLock: jest.fn(),
    };

    const mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          into: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationSettingsService,
        { provide: AuthenticationSettingsRepository, useValue: mockRepo },
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    service = module.get<AuthenticationSettingsService>(AuthenticationSettingsService);
    repository = module.get(AuthenticationSettingsRepository);
  });

  it('should return settings for valid tenant', async () => {
    const mockEntity: Partial<AuthenticationSettings> = {
      tenant: { tenantCode: 'TENANT_123', companyId: 'COMP_1', status: 'active' },
      restrictedMfaEnabled: false,
      needAdminResetPassword: true,
      accountLockoutEnabled: true,
      maxFailedRetries: 5,
      ipRestrictionEnabled: false,
      allowedIpCidrs: ['192.168.1.0/24'],
      version: 1,
      updatedAt: new Date(),
    };

    repository.findByTenantCode.mockResolvedValue(mockEntity as AuthenticationSettings);

    const result = await service.getSettings('TENANT_123');
    expect(result.tenantCode).toBe('TENANT_123');
    expect(result.mfaRequired).toBe(false);
  });
});
