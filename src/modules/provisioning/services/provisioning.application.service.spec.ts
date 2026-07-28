import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { ProvisioningApplicationService } from './provisioning.application.service';
import { EventType } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { Invitation } from '../../invite/entities/invitation.entity';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';
import { ConsumedEvent } from '../entities/consumed-event.entity';
import { ConsumedEventRepository } from '../repositories/consumed-event.repository';

describe('ProvisioningApplicationService', () => {
  let service: ProvisioningApplicationService;
  let mockTransactionService: { runInTransaction: jest.Mock; getManager: jest.Mock };
  let mockUserRepository: Record<string, unknown>;
  let mockConsumedEventRepository: { exists: jest.Mock; save: jest.Mock };
  let mockOutboxRepository: Record<string, unknown>;
  let mockSessionService: { revokeAllSessions: jest.Mock };
  let mockEntityManager: { getRepository: jest.Mock };

  let mockTypeormUserRepository: { findOne: jest.Mock; save: jest.Mock };
  let mockTypeormEmployeeRefRepository: { findOne: jest.Mock; save: jest.Mock };
  let mockTypeormInvitationRepository: { find: jest.Mock; save: jest.Mock };
  let mockTypeormOutboxRepository: { save: jest.Mock };
  let mockTypeormConsumedEventRepository: { save: jest.Mock };

  beforeEach(async () => {
    mockTypeormUserRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => ({ id: 'new-user-uuid', ...u })),
    };

    mockTypeormEmployeeRefRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((er) => er),
    };

    mockTypeormInvitationRepository = {
      find: jest.fn(),
      save: jest.fn().mockImplementation((inv) => {
        if (Array.isArray(inv)) {
          return inv;
        }
        return { id: 'new-invitation-uuid', ...inv };
      }),
    };

    mockTypeormOutboxRepository = {
      save: jest.fn().mockImplementation((o) => o),
    };

    mockTypeormConsumedEventRepository = {
      save: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === User) return mockTypeormUserRepository;
        if (entity === EmployeeReference) return mockTypeormEmployeeRefRepository;
        if (entity === Invitation) return mockTypeormInvitationRepository;
        if (entity === AuthSecurityEventOutbox) return mockTypeormOutboxRepository;
        if (entity === ConsumedEvent) return mockTypeormConsumedEventRepository;
        return null;
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
    mockSessionService = {
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningApplicationService,
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: ConsumedEventRepository, useValue: mockConsumedEventRepository },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
        { provide: SessionApplicationService, useValue: mockSessionService },
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

  describe('bootstrapRootAdmin', () => {
    it('should return DUPLICATE if event is already processed', async () => {
      mockConsumedEventRepository.exists.mockResolvedValue(true);

      const result = await service.bootstrapRootAdmin('evt-123', 'topic-name', {
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'root@tenant.com',
      });

      expect(result).toEqual({ success: true, reason: 'DUPLICATE' });
      expect(mockConsumedEventRepository.exists).toHaveBeenCalledWith('evt-123');
    });

    it('should throw BadRequestException if rootAdminEmail is missing', async () => {
      await expect(
        service.bootstrapRootAdmin('evt-123', 'topic-name', {
          tenantCode: 'TENANT_A',
          rootAdminEmail: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if rootAdminEmail format is invalid', async () => {
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
    });

    it('should create root admin successfully', async () => {
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      const result = await service.bootstrapRootAdmin('evt-123', 'topic-name', {
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'root@tenant-a.com',
      });

      expect(result).toEqual({ success: true });
      expect(mockTypeormUserRepository.save).toHaveBeenCalled();
    });
  });

  describe('synchronizeEmployeeStatus - US1 Suspension', () => {
    it('should return DUPLICATE if event is already consumed', async () => {
      mockConsumedEventRepository.exists.mockResolvedValue(true);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_SUSPENDED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true, reason: 'DUPLICATE' });
      expect(mockConsumedEventRepository.exists).toHaveBeenCalledWith('evt-123');
    });

    it('should return UNKNOWN_EMPLOYEE_REFERENCE if employee reference not found', async () => {
      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(null);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_SUSPENDED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true, reason: 'UNKNOWN_EMPLOYEE_REFERENCE' });
    });

    it('should return STALE_VERSION if event version is less than or equal to stored version', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '10';

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_SUSPENDED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10, // equal to 10
        },
      );

      expect(result).toEqual({ success: true, reason: 'STALE_VERSION' });
    });

    it('should suspend user, bump security version, write outbox and clear sessions post-commit', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '9';

      const existingUser = new User();
      existingUser.id = 'user-123';
      existingUser.tenantCode = 'TENANT_A';
      existingUser.status = 'active';
      existingUser.securityVersion = 1;

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);
      mockTypeormUserRepository.findOne.mockResolvedValue(existingUser);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_SUSPENDED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true });
      expect(existingUser.status).toBe('disabled');
      expect(existingUser.securityVersion).toBe(2);
      expect(existingRef.status).toBe('suspended');
      expect(existingRef.sourceVersion).toBe('10');

      expect(mockTypeormOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.AUTHENTICATION_SESSIONS_REVOKED,
          userId: 'user-123',
        }),
      );
      expect(mockSessionService.revokeAllSessions).toHaveBeenCalledWith('TENANT_A', 'user-123');
    });

    it('should terminate user, bump security version, revoke active invitations, write outbox and clear sessions post-commit', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '9';

      const existingUser = new User();
      existingUser.id = 'user-123';
      existingUser.tenantCode = 'TENANT_A';
      existingUser.status = 'active';
      existingUser.securityVersion = 2;

      const mockInvitation = new Invitation();
      mockInvitation.userId = 'user-123';
      mockInvitation.status = 'pending';

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);
      mockTypeormUserRepository.findOne.mockResolvedValue(existingUser);
      mockTypeormInvitationRepository.find.mockResolvedValue([mockInvitation]);

      const result = await service.synchronizeEmployeeStatus(
        'evt-124',
        EventType.EMPLOYEE_TERMINATED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true });
      expect(existingUser.status).toBe('archived');
      expect(existingUser.securityVersion).toBe(3);
      expect(existingRef.status).toBe('terminated');
      expect(existingRef.sourceVersion).toBe('10');

      expect(mockTypeormInvitationRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123', status: 'pending' },
      });
      expect(mockTypeormInvitationRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-123',
          status: 'revoked',
          revokedAt: expect.any(Date),
        }),
      ]);

      expect(mockTypeormOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.AUTHENTICATION_SESSIONS_REVOKED,
          userId: 'user-123',
          sanitizedPayload: expect.objectContaining({
            newStatus: 'ARCHIVED',
          }),
        }),
      );
      expect(mockSessionService.revokeAllSessions).toHaveBeenCalledWith('TENANT_A', 'user-123');
    });

    it('should reactivate user, bump security version, revoke active invitations, create a new invitation, and write user-invited to outbox', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '9';

      const existingUser = new User();
      existingUser.id = 'user-123';
      existingUser.tenantCode = 'TENANT_A';
      existingUser.status = 'archived';
      existingUser.securityVersion = 3;
      existingUser.displayEmail = 'rehire@tenant.com';
      existingUser.normalizedEmail = 'rehire@tenant.com';

      const mockInvitation = new Invitation();
      mockInvitation.userId = 'user-123';
      mockInvitation.status = 'pending';

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);
      mockTypeormUserRepository.findOne.mockResolvedValue(existingUser);
      mockTypeormInvitationRepository.find.mockResolvedValue([mockInvitation]);

      const result = await service.synchronizeEmployeeStatus(
        'evt-125',
        EventType.EMPLOYEE_REACTIVATED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true });
      expect(existingUser.status).toBe('invited');
      expect(existingUser.securityVersion).toBe(4);
      expect(existingRef.status).toBe('reactivated');
      expect(existingRef.sourceVersion).toBe('10');

      expect(mockTypeormInvitationRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123', status: 'pending' },
      });
      // Verify revoke old invitations
      expect(mockTypeormInvitationRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-123',
          status: 'revoked',
          revokedAt: expect.any(Date),
        }),
      ]);

      // Verify create new invitation
      expect(mockTypeormInvitationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          status: 'pending',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );

      // Verify write user-invited to outbox
      expect(mockTypeormOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.AUTHENTICATION_USER_INVITED,
          userId: 'user-123',
          sanitizedPayload: expect.objectContaining({
            userId: 'user-123',
            email: 'rehire@tenant.com',
            invitationId: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('synchronizeEmployeeStatus - Missing User Reference', () => {
    it('should update employee reference to suspended if user is missing', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '9';

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_SUSPENDED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true });
      expect(existingRef.status).toBe('suspended');
      expect(existingRef.sourceVersion).toBe('10');
      expect(mockTypeormConsumedEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'evt-123' }),
      );
    });

    it('should update employee reference to terminated if user is missing', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '9';

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_TERMINATED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true });
      expect(existingRef.status).toBe('terminated');
      expect(existingRef.sourceVersion).toBe('10');
    });

    it('should update employee reference to reactivated if user is missing', async () => {
      const existingRef = new EmployeeReference();
      existingRef.employeeId = 'emp-123';
      existingRef.tenantCode = 'TENANT_A';
      existingRef.sourceVersion = '9';

      mockTypeormEmployeeRefRepository.findOne.mockResolvedValue(existingRef);
      mockTypeormUserRepository.findOne.mockResolvedValue(null);

      const result = await service.synchronizeEmployeeStatus(
        'evt-123',
        EventType.EMPLOYEE_REACTIVATED,
        {
          employeeId: 'emp-123',
          tenantCode: 'TENANT_A',
          sourceVersion: 10,
        },
      );

      expect(result).toEqual({ success: true });
      expect(existingRef.status).toBe('reactivated');
      expect(existingRef.sourceVersion).toBe('10');
    });
  });
});

