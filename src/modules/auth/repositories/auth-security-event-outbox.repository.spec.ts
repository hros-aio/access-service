/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { AuthSecurityEventOutboxRepository } from './auth-security-event-outbox.repository';
import { AuthSecurityEventOutbox } from '../entities/auth-security-event-outbox.entity';

describe('AuthSecurityEventOutboxRepository', () => {
  let repository: AuthSecurityEventOutboxRepository;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      clear: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    const mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSecurityEventOutboxRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<AuthSecurityEventOutboxRepository>(AuthSecurityEventOutboxRepository);

    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find pending events without tenant scope', async () => {
    const events = [new AuthSecurityEventOutbox()];
    mockTypeormRepository.find.mockResolvedValue(events);

    const result = await repository.findPendingEvents();
    expect(result).toEqual(events);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: {
        publishStatus: 'pending',
      },
    });
  });

  it('should find events by user ID with tenant scope', async () => {
    const events = [new AuthSecurityEventOutbox()];
    mockTypeormRepository.find.mockResolvedValue(events);

    const result = await repository.findByUserId('user-uuid');
    expect(result).toEqual(events);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: {
        tenantCode: 'TENANT_A',
        userId: 'user-uuid',
      },
    });
  });

  it('should throw an error in findByUserId when tenant code is missing', async () => {
    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue(null as any);
    await expect(repository.findByUserId('user-uuid')).rejects.toThrow(
      'Tenant code is missing from active RequestContext',
    );
  });

  it('should create and save an entity', async () => {
    const entityData = { userId: 'test' };
    mockTypeormRepository.save.mockResolvedValue(entityData);

    const result = await repository.create(entityData);
    expect(mockTypeormRepository.create).toHaveBeenCalledWith(entityData);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(entityData);
    expect(result).toEqual(entityData);
  });

  it('should clear all records', async () => {
    await repository.clear();
    expect(mockTypeormRepository.clear).toHaveBeenCalled();
  });
});
