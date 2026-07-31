/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { LockoutService } from './lockout.service';
import { UserStatus } from '../../../enums';
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
      client: {
        get: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      },
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
      mockRedisCacheProvider.client.get.mockResolvedValue('3');
      const count = await service.getFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(3);
      expect(mockRedisCacheProvider.client.get).toHaveBeenCalledWith(
        'auth:login-failure:TENANT_123:user-123',
      );
    });

    it('should return 0 if no count in Redis', async () => {
      mockRedisCacheProvider.client.get.mockResolvedValue(null);
      const count = await service.getFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(0);
    });
  });

  describe('incrementFailureCount', () => {
    it('should increment and set TTL on first attempt', async () => {
      mockRedisCacheProvider.client.incr.mockResolvedValue(1);
      const count = await service.incrementFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(1);
      expect(mockRedisCacheProvider.client.incr).toHaveBeenCalled();
      expect(mockRedisCacheProvider.client.expire).toHaveBeenCalledWith(
        'auth:login-failure:TENANT_123:user-123',
        900,
      );
    });

    it('should increment without setting TTL on subsequent attempts', async () => {
      mockRedisCacheProvider.client.incr.mockResolvedValue(2);
      const count = await service.incrementFailureCount('TENANT_123', 'user-123');
      expect(count).toBe(2);
      expect(mockRedisCacheProvider.client.incr).toHaveBeenCalled();
      expect(mockRedisCacheProvider.client.expire).not.toHaveBeenCalled();
    });
  });

  describe('resetFailureCount', () => {
    it('should delete the failure key from Redis', async () => {
      await service.resetFailureCount('TENANT_123', 'user-123');
      expect(mockRedisCacheProvider.client.del).toHaveBeenCalledWith(
        'auth:login-failure:TENANT_123:user-123',
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
      expect(mockRedisCacheProvider.client.incr).not.toHaveBeenCalled();
    });

    it('should increment counter but not lock if under threshold', async () => {
      mockRedisCacheProvider.client.incr.mockResolvedValue(3);
      const result = await service.handleFailure('TENANT_123', 'user-123', settings);
      expect(result).toBe(false);
      expect(mockTypeormRepository.save).not.toHaveBeenCalled();
    });

    it('should lock user in database if threshold reached', async () => {
      mockRedisCacheProvider.client.incr.mockResolvedValue(5);
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
    });
  });
});
