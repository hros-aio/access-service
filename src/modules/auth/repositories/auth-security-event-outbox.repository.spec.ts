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

  it('should find pending events with tenant scope', async () => {
    const events = [new AuthSecurityEventOutbox()];
    mockTypeormRepository.find.mockResolvedValue(events);

    const result = await repository.findPendingEvents();
    expect(result).toEqual(events);
    expect(mockTypeormRepository.find).toHaveBeenCalledWith({
      where: {
        publishStatus: 'pending',
        tenantCode: 'TENANT_A',
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
        userId: 'user-uuid',
        tenantCode: 'TENANT_A',
      },
    });
  });
});
