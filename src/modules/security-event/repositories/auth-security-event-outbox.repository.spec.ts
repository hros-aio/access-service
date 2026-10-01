/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@new-hros/libs-core';
import { OutboxEventEntity, OutboxStatus, TransactionService } from '@new-hros/libs-sql';

import { OutboxEventRepository } from './outbox-event.repository';

describe('OutboxEventRepository', () => {
  let repository: OutboxEventRepository;
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
        OutboxEventRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<OutboxEventRepository>(OutboxEventRepository);

    jest.spyOn(RequestContextService, 'getTenantCode').mockReturnValue('TENANT_A');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should find pending events without tenant scope', async () => {
    const events = [new OutboxEventEntity()];
    mockTypeormRepository.find.mockResolvedValue(events);

    const result = await repository.findPendingEvents();
    expect(result).toEqual(events);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: {
        status: OutboxStatus.PENDING,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  });

  it('should find events by user ID with tenant scope', async () => {
    const events = [new OutboxEventEntity()];
    mockTypeormRepository.find.mockResolvedValue(events);

    const result = await repository.findByUserId('user-uuid');
    expect(result).toEqual(events);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: {
        tenantCode: 'TENANT_A',
        aggregateId: 'user-uuid',
      },
      order: {
        createdAt: 'DESC',
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
    const entityData = {
      tenantCode: 'TENANT_A',
      aggregateType: 'TEST',
      aggregateId: 'test-uuid',
      payload: {},
      status: OutboxStatus.PENDING,
      eventType: 'test.event',
      eventVersion: 1,
    };
    mockTypeormRepository.save.mockResolvedValue(entityData);

    const result = await repository.create(entityData as any);
    expect(mockTypeormRepository.create).toHaveBeenCalledWith(entityData);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(entityData);
    expect(result).toEqual(entityData);
  });

  it('should clear all records', async () => {
    await repository.clear();
    expect(mockTypeormRepository.clear).toHaveBeenCalled();
  });
});
