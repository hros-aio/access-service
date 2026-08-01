/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { LockoutService } from './lockout.service';
import { UserStatus } from '../../../enums';
import { AuthStoreUnavailableError } from '../../auth/exceptions/auth.exception';
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

  beforeEach(async () => {
    mockRedisCacheProvider = {
      getClient: jest.fn().mockReturnValue({
        get: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockoutService,
        { provide: RedisCacheProvider, useValue: mockRedisCacheProvider },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: TransactionService, useValue: mockTransactionService },
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
      expect(mockRedisCacheProvider.getClient().get).toHaveBeenCalledWith(
        'auth:login-failure:TENANT_123:user-123',
      );
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

    it('should throw AuthStoreUnavailableError if redis lookup fails', async () => {
      mockRedisCacheProvider.getClient().get.mockRejectedValue(new Error('Redis error'));
      await expect(service.getFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
      );
    });
  });

  describe('incrementFailureCount', () => {
    it('should increment and set TTL on first attempt', async () => {
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(1);
      const count = await service.incrementFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(1);
      expect(mockRedisCacheProvider.getClient().incr).toHaveBeenCalled();
      expect(mockRedisCacheProvider.getClient().expire).toHaveBeenCalledWith(
        'auth:login-failure:TENANT_123:user-123',
        900,
      );
    });

    it('should increment without setting TTL on subsequent attempts', async () => {
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(2);
      const count = await service.incrementFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(2);
      expect(mockRedisCacheProvider.getClient().incr).toHaveBeenCalled();
      expect(mockRedisCacheProvider.getClient().expire).not.toHaveBeenCalled();
    });

    it('should throw AuthStoreUnavailableError if redis client is null', async () => {
      mockRedisCacheProvider.getClient.mockReturnValue(null);
      await expect(service.incrementFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
      );
    });

    it('should throw AuthStoreUnavailableError if redis increment fails', async () => {
      mockRedisCacheProvider.getClient().incr.mockRejectedValue(new Error('Redis error'));
      await expect(service.incrementFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
      );
    });
  });

  describe('resetFailureCount', () => {
    it('should delete the failure key from Redis', async () => {
      await service.resetFailureCount('TENANT_123', 'user-123');
      expect(mockRedisCacheProvider.getClient().del).toHaveBeenCalledWith(
        'auth:login-failure:TENANT_123:user-123',
      );
    });

    it('should throw AuthStoreUnavailableError if redis client is null', async () => {
      mockRedisCacheProvider.getClient.mockReturnValue(null);
      await expect(service.resetFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
      );
    });

    it('should throw AuthStoreUnavailableError if redis delete fails', async () => {
      mockRedisCacheProvider.getClient().del.mockRejectedValue(new Error('Redis error'));
      await expect(service.resetFailureCount('TENANT_123', 'user-123')).rejects.toThrow(
        AuthStoreUnavailableError,
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
      expect(mockRedisCacheProvider.getClient().incr).not.toHaveBeenCalled();
    });

    it('should return false if settings are undefined', async () => {
      const result = await service.handleFailure('TENANT_123', 'user-123');
      expect(result).toBe(false);
      expect(mockRedisCacheProvider.getClient().incr).not.toHaveBeenCalled();
    });

    it('should increment counter but not lock if under threshold', async () => {
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(3);
      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(false);
      expect(mockTypeormRepository.save).not.toHaveBeenCalled();
    });

    it('should lock user in database if threshold reached', async () => {
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(5);
      const mockUser = { id: 'user-123', status: UserStatus.ACTIVE } as User;
      mockTypeormRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(true);
      expect(mockTypeormRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockUser.status).toBe(UserStatus.LOCKED);
      expect(mockTypeormRepository.save).toHaveBeenCalledWith(mockUser);
      expect(mockTransactionService.runInTransaction).toHaveBeenCalled();
    });

    it('should return false if user is already locked', async () => {
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(5);
      const mockUser = { id: 'user-123', status: UserStatus.LOCKED } as User;
      mockTypeormRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(false);
      expect(mockTypeormRepository.save).not.toHaveBeenCalled();
    });

    it('should return false if user is not found', async () => {
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(5);
      mockTypeormRepository.findOne.mockResolvedValue(null);

      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(false);
      expect(mockTypeormRepository.save).not.toHaveBeenCalled();
    });

    it('should use default threshold of 5 if maxFailedRetries is not set', async () => {
      const settingsWithoutMax = { accountLockoutEnabled: true } as AuthenticationSettings;
      mockRedisCacheProvider.getClient().incr.mockResolvedValue(5);
      const mockUser = { id: 'user-123', status: UserStatus.ACTIVE } as User;
      mockTypeormRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.handleFailure('TENANT_123', 'user-123', settingsWithoutMax);
      expect(result).toBe(true);
      expect(mockTypeormRepository.save).toHaveBeenCalled();
    });
  });
});
