/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider, RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { MfaAdminApplicationService } from './mfa_admin_application.service';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
import { AuthSecurityEventOutboxRepository } from '../../security-event';
import { UserRepository } from '../../user/repositories/user.repository';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

describe('MfaAdminApplicationService', () => {
  let service: MfaAdminApplicationService;
  let repository: jest.Mocked<MfaMethodRepository>;
  let redisCacheProvider: Record<string, jest.Mock>;
  let mockRedisClient: { smembers: jest.Mock; del: jest.Mock };
  let mockTransactionService: { runInTransaction: jest.Mock };
  let mockUserRepository: { incrementSecurityVersionById: jest.Mock };
  let mockOutboxRepository: { create: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('t-1');
    jest.spyOn(RequestContextService, 'getUser').mockReturnValue({ userId: 'admin-1' } as any);

    repository = {
      disableAllUserFactors: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MfaMethodRepository>;

    mockRedisClient = {
      smembers: jest.fn().mockResolvedValue(['sess-1', 'sess-2']),
      del: jest.fn().mockResolvedValue(1),
    };

    redisCacheProvider = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation(async (cb: () => Promise<unknown>) => cb()),
    };

    mockUserRepository = {
      incrementSecurityVersionById: jest.fn(),
    };

    mockOutboxRepository = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaAdminApplicationService,
        { provide: MfaMethodRepository, useValue: repository },
        { provide: RedisCacheProvider, useValue: redisCacheProvider },
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = module.get<MfaAdminApplicationService>(MfaAdminApplicationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw NotFoundException if user is not found in tenant', async () => {
    mockUserRepository.incrementSecurityVersionById.mockResolvedValue(0);

    await expect(service.resetUserMfa('u-1')).rejects.toThrow(NotFoundException);
  });

  it('should reset user MFA, bump security version, create outbox event, and clear redis sessions', async () => {
    mockUserRepository.incrementSecurityVersionById.mockResolvedValue(1);

    const result = await service.resetUserMfa('u-1');

    expect(result.revokedSessionsCount).toBe(2);
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(repository.disableAllUserFactors).toHaveBeenCalledWith('u-1');
    expect(mockOutboxRepository.create).toHaveBeenCalledWith({
      tenantCode: 't-1',
      userId: 'u-1',
      eventType: 'authentication.mfa-reset',
      sanitizedPayload: {
        tenantCode: 't-1',
        targetUserId: 'u-1',
        adminUserId: 'admin-1',
        resetAt: expect.any(String),
      },
      publishStatus: 'pending',
    });
    expect(mockRedisClient.smembers).toHaveBeenCalledWith(GenerateUserSessionsKey('t-1', 'u-1'));
    expect(mockRedisClient.del).toHaveBeenCalledWith(GenerateSessionKey('sess-1'));
    expect(mockRedisClient.del).toHaveBeenCalledWith(GenerateSessionKey('sess-2'));
    expect(mockRedisClient.del).toHaveBeenCalledWith(GenerateUserSessionsKey('t-1', 'u-1'));
  });
});
