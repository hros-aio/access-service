import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { RequestContextService } from '@new-hros/libs-core';
import { UserRepository } from '../../user/repositories/user.repository';
import { ConsumedEventRepository } from '../repositories/consumed-event.repository';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { ProvisioningApplicationService } from './provisioning.application.service';
import { User } from '../../user/entities/user.entity';

describe('ProvisioningApplicationService', () => {
  let service: ProvisioningApplicationService;
  let mockTransactionService: any;
  let mockUserRepository: any;
  let mockConsumedEventRepository: any;
  let mockOutboxRepository: any;
  let mockEntityManager: any;
  let mockTypeormUserRepository: any;
  let mockTypeormOutboxRepository: any;

  beforeEach(async () => {
    mockTypeormUserRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => ({ id: 'new-user-uuid', ...u })),
    };

    mockTypeormOutboxRepository = {
      save: jest.fn().mockImplementation((o) => o),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === User) return mockTypeormUserRepository;
        return mockTypeormOutboxRepository;
      }),
    };

    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    mockUserRepository = {};
    mockConsumedEventRepository = {
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
    };
    mockOutboxRepository = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningApplicationService,
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: ConsumedEventRepository, useValue: mockConsumedEventRepository },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
      ],
    }).compile();

    service = module.get<ProvisioningApplicationService>(ProvisioningApplicationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return DUPLICATE if event is already processed', async () => {
    mockConsumedEventRepository.exists.mockResolvedValue(true);

    const result = await service.bootstrapRootAdmin('evt-123', 'topic-name', {
      tenantCode: 'TENANT_A',
      rootAdminEmail: 'root@tenant.com',
    });

    expect(result).toEqual({ success: true, reason: 'DUPLICATE' });
    expect(mockConsumedEventRepository.exists).toHaveBeenCalledWith('evt-123');
    expect(mockTypeormUserRepository.findOne).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if rootAdminEmail is missing', async () => {
    await expect(
      service.bootstrapRootAdmin('evt-123', 'topic-name', {
        tenantCode: 'TENANT_A',
        rootAdminEmail: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if rootAdminEmail is invalid', async () => {
    await expect(
      service.bootstrapRootAdmin('evt-123', 'topic-name', {
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'invalid-email',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return ALREADY_EXISTS if root admin user exists', async () => {
    mockTypeormUserRepository.findOne.mockResolvedValue(new User());

    const result = await service.bootstrapRootAdmin('evt-123', 'topic-name', {
      tenantCode: 'TENANT_A',
      rootAdminEmail: 'root@tenant-a.com',
    });

    expect(result).toEqual({ success: true, reason: 'ALREADY_EXISTS' });
    expect(mockTypeormUserRepository.findOne).toHaveBeenCalledWith({
      where: { tenantCode: 'TENANT_A', protectedRootAdmin: true },
      lock: { mode: 'pessimistic_write' },
    });
    expect(mockConsumedEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-123', topic: 'topic-name' }),
    );
  });

  it('should create root admin, outbox, and consumed event successfully', async () => {
    mockTypeormUserRepository.findOne.mockResolvedValue(null);

    const result = await service.bootstrapRootAdmin('evt-123', 'topic-name', {
      tenantCode: 'TENANT_A',
      rootAdminEmail: 'root@tenant-a.com',
    });

    expect(result).toEqual({ success: true });
    expect(mockTypeormUserRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantCode: 'TENANT_A',
        displayEmail: 'root@tenant-a.com',
        normalizedEmail: 'root@tenant-a.com',
        status: 'active',
        protectedRootAdmin: true,
      }),
    );
    expect(mockTypeormOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'authentication.user-provisioned',
        publishStatus: 'pending',
      }),
    );
    expect(mockConsumedEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-123', topic: 'topic-name' }),
    );
  });
});
