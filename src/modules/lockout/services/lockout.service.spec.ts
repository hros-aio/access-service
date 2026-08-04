/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { LockoutService } from './lockout.service';
import { UserStatus } from '../../../enums';
import { AuthStoreUnavailableError } from '../../auth/exceptions/auth.exception';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';

describe('LockoutService', () => {
  let service: LockoutService;
  let mockRedisCacheProvider: any;
  let mockUserRepository: any;
  let mockTransactionService: any;
  let mockEntityManager: any;
  let mockTypeormRepository: any;
  let mockSecurityEventService: any;

  beforeEach(async () => {
    mockRedisCacheProvider = {
      getClient: jest.fn().mockReturnValue({
        get: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
        eval: jest.fn(),
      }),
    };

    mockUserRepository = {
      save: jest.fn(),
    };

    mockTypeormRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
      runInTransaction: jest.fn().mockImplementation((work) => work()),
    };

    mockSecurityEventService = {
      logLoginFailed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockoutService,
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: SecurityEventService, useValue: mockSecurityEventService },
      ],
    }).compile();

    service = module.get<LockoutService>(LockoutService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFailureCount', () => {
    it('should return parsed count from Redis if exists', async () => {
      mockRedisCacheProvider.getClient().get.mockResolvedValue('3');
      const count = await service.getFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(3);
    });

    it('should return 0 if no count in Redis', async () => {
      mockRedisCacheProvider.getClient().get.mockResolvedValue(null);
      const count = await service.getFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(0);
    });

    it('should throw AuthStoreUnavailableError if redis client is null', async () => {
      mockRedisCacheProvider.getClient.mockReturnValue(null);
      await expect(service.getFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
      );
    });
  });

  describe('incrementFailureCount', () => {
    it('should increment using adapter eval', async () => {
      mockRedisCacheProvider.getClient().eval.mockResolvedValue(1);
      const count = await service.incrementFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(1);
      expect(mockRedisCacheProvider.getClient().eval).toHaveBeenCalled();
    });

    it('should throw AuthStoreUnavailableError if redis client is null', async () => {
      mockRedisCacheProvider.getClient.mockReturnValue(null);
      await expect(service.incrementFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
      );
    });
  });

  describe('recordIpFailure', () => {
    it('should increment IP failure counter and trigger alert if >= 10', async () => {
      mockRedisCacheProvider.getClient().eval.mockResolvedValue(10);
      const count = await service.recordIpFailure('TENANT_123', 'user-123', '192.0.2.1');
      expect(count).toBe(10);
      expect(mockSecurityEventService.logLoginFailed).toHaveBeenCalledWith(
        'TENANT_123',
        'ip-restriction-alert',
        '192.0.2.1',
        'UNAPPROVED_IP_SPIKE',
        'user-123',
        'system',
      );
    });
  });

  describe('resetFailureCount', () => {
    it('should delete the failure key from Redis', async () => {
      await service.resetFailureCount('TENANT_123', 'user-123');
      expect(mockRedisCacheProvider.getClient().del).toHaveBeenCalledWith(
        'auth:login-failure:{TENANT_123}:user-123',
      );
    });
  });

  describe('handleFailure', () => {
    const settings = {
      accountLockoutEnabled: true,
      maxFailedRetries: 5,
    } as AuthenticationSettings;

    it('should return false if lockout is disabled', async () => {
      const disabledSettings = { accountLockoutEnabled: false } as AuthenticationSettings;
      const result = await service.handleFailure('TENANT_123', 'user-123', disabledSettings);
      expect(result).toBe(false);
    });

    it('should increment counter but not lock if under threshold', async () => {
      mockRedisCacheProvider.getClient().eval.mockResolvedValue(3);
      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(false);
    });

    it('should lock user in database if threshold reached', async () => {
      mockRedisCacheProvider.getClient().eval.mockResolvedValue(5);
      const mockUser = { id: 'user-123', status: UserStatus.ACTIVE, securityVersion: 1 } as User;
      mockTypeormRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(true);
      expect(mockUser.status).toBe(UserStatus.LOCKED);
      expect(mockUser.securityVersion).toBe(2);
      expect(mockTypeormRepository.save).toHaveBeenCalledWith(mockUser);
    });
  });
});
