import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthenticationSettingsService } from './authentication-settings.service';
import { UpdateAuthenticationSettingsDto } from '../dto/authentication-settings.dto';
import { AuthenticationSettings } from '../entities/authentication-settings.entity';
import { AuthenticationSettingsRepository } from '../repositories/authentication-settings.repository';

describe('AuthenticationSettingsService', () => {
  let service: AuthenticationSettingsService;
  let repository: jest.Mocked<AuthenticationSettingsRepository>;
  let transactionService: jest.Mocked<TransactionService>;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateWithOptimisticLock: jest.fn(),
      findByTenantCode: jest.fn(),
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
    transactionService = module.get(TransactionService);
  });

  describe('getSettings', () => {
    it('should return authentication settings using repository findOne with required option', async () => {
      const mockEntity: Partial<AuthenticationSettings> = {
        id: 'setting-1',
        tenantCode: 'TENANT_123',
        restrictedMfaEnabled: false,
        needAdminResetPassword: true,
        accountLockoutEnabled: true,
        maxFailedRetries: 5,
        ipRestrictionEnabled: false,
        allowedIpCidrs: ['192.168.1.0/24'],
        version: 1,
        updatedAt: new Date(),
      };

      repository.findOne.mockResolvedValue(mockEntity as AuthenticationSettings);

      const result = await service.getSettings();

      expect(repository.findOne).toHaveBeenCalledWith({}, { required: true });
      expect(result).toEqual(mockEntity);
    });
  });

  describe('upsertSettings', () => {
    it('should create settings if not existing', async () => {
      const dto: UpdateAuthenticationSettingsDto = {
        mfaRequired: true,
        selfServicePasswordResetEnabled: false,
        lockoutEnabled: true,
        lockoutThreshold: 3,
        ipRestrictionEnabled: true,
        ipAllowList: ['10.0.0.1'],
        version: 1,
      };

      repository.findOne.mockResolvedValue(null);
      const createdEntity = { id: 'new-id', ...dto } as unknown as AuthenticationSettings;
      repository.create.mockResolvedValue(createdEntity);

      const result = await service.upsertSettings(dto);

      expect(transactionService.runInTransaction).toHaveBeenCalled();
      expect(repository.findOne).toHaveBeenCalledWith({});
      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(createdEntity);
    });

    it('should update existing settings with changed fields and optimistic lock', async () => {
      const currentEntity: Partial<AuthenticationSettings> = {
        id: 'setting-1',
        tenantCode: 'TENANT_123',
        restrictedMfaEnabled: false,
        needAdminResetPassword: true,
        accountLockoutEnabled: false,
        maxFailedRetries: 5,
        ipRestrictionEnabled: false,
        allowedIpCidrs: [],
        version: 1,
      };

      const dto: UpdateAuthenticationSettingsDto = {
        mfaRequired: true,
        selfServicePasswordResetEnabled: false,
        lockoutEnabled: true,
        lockoutThreshold: 3,
        ipRestrictionEnabled: true,
        ipAllowList: ['192.168.1.0/24'],
        version: 1,
      };

      const updatedEntity = {
        ...currentEntity,
        restrictedMfaEnabled: true,
        needAdminResetPassword: false,
        accountLockoutEnabled: true,
        maxFailedRetries: 3,
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
        version: 2,
      } as AuthenticationSettings;

      repository.findOne.mockResolvedValue(currentEntity as AuthenticationSettings);
      repository.updateWithOptimisticLock.mockResolvedValue(updatedEntity);

      const result = await service.upsertSettings(dto);

      expect(repository.findOne).toHaveBeenCalledWith({});
      expect(repository.updateWithOptimisticLock).toHaveBeenCalledWith('setting-1', 1, {
        restrictedMfaEnabled: true,
        needAdminResetPassword: false,
        accountLockoutEnabled: true,
        maxFailedRetries: 3,
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
      });
      expect(result).toEqual(updatedEntity);
    });
  });
});
