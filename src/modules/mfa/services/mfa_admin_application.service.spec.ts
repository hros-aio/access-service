import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { DataSource } from 'typeorm';

import { MfaAdminApplicationService } from './mfa_admin_application.service';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

describe('MfaAdminApplicationService', () => {
  let service: MfaAdminApplicationService;
  let repository: jest.Mocked<MfaMethodRepository>;
  let redisCacheProvider: Record<string, jest.Mock>;
  let mockRedisClient: { smembers: jest.Mock; del: jest.Mock };
  let dataSource: Record<string, jest.Mock>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      query: jest.fn(),
    },
  };

  beforeEach(async () => {
    repository = {
      disableAllUserFactors: jest.fn(),
    } as unknown as jest.Mocked<MfaMethodRepository>;

    mockRedisClient = {
      smembers: jest.fn().mockResolvedValue(['sess-1', 'sess-2']),
      del: jest.fn(),
    };

    redisCacheProvider = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaAdminApplicationService,
        { provide: MfaMethodRepository, useValue: repository },
        { provide: RedisCacheProvider, useValue: redisCacheProvider },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<MfaAdminApplicationService>(MfaAdminApplicationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw NotFoundException if user is not found in tenant', async () => {
    mockQueryRunner.manager.query.mockResolvedValueOnce([[]]);

    await expect(service.resetUserMfa('t-1', 'u-1', 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('should reset user MFA, bump security version, clear redis sessions and record outbox event', async () => {
    mockQueryRunner.manager.query
      .mockResolvedValueOnce([[{ id: 'u-1' }]]) // UPDATE users
      .mockResolvedValueOnce([]); // INSERT outbox

    const result = await service.resetUserMfa('t-1', 'u-1', 'admin-1');

    expect(result.success).toBe(true);
    expect(repository.disableAllUserFactors).toHaveBeenCalledWith('t-1', 'u-1');
    expect(mockRedisClient.smembers).toHaveBeenCalledWith(GenerateUserSessionsKey('t-1', 'u-1'));
    expect(mockRedisClient.del).toHaveBeenCalledWith(GenerateSessionKey('sess-1'));
    expect(mockRedisClient.del).toHaveBeenCalledWith(GenerateSessionKey('sess-2'));
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });
});
