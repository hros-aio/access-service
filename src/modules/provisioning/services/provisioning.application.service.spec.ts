import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';

import { ProvisioningApplicationService } from './provisioning.application.service';
import { SystemRoleSeederService } from './system-role-seeder.service';
import { EventType, InvitationStatus, UserStatus } from '../../../enums';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { EmployeeReference } from '../../employee/entities/employee-reference.entity';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { Invitation } from '../../invite/entities/invitation.entity';
import { InvitationRepository } from '../../invite/repositories/invitation.repository';
import { AuthSecurityEventOutboxRepository } from '../../security-event';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';

import { EmployeeStatus } from '@/enums/employee-status.enum';

describe('ProvisioningApplicationService', () => {
  let service: ProvisioningApplicationService;
  let mockTransactionService: { runInTransaction: jest.Mock };
  let mockUserRepository: { findOne: jest.Mock; create: jest.Mock; update: jest.Mock };
  let mockEmployeeReferenceRepository: { findById: jest.Mock; update: jest.Mock };
  let mockInvitationRepository: { find: jest.Mock; bulkSave: jest.Mock; create: jest.Mock };
  let mockOutboxRepository: { save: jest.Mock; create: jest.Mock };
  let mockSessionService: { revokeAllSessions: jest.Mock };
  let mockSystemRoleSeederService: { seedBaselineSystemRoles: jest.Mock };

  beforeEach(async () => {
    mockTransactionService = {
      runInTransaction: jest.fn().mockImplementation((cb) => cb()),
    };

    mockUserRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((u) => ({ id: 'new-user-uuid', ...u })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockEmployeeReferenceRepository = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockInvitationRepository = {
      find: jest.fn(),
      bulkSave: jest.fn().mockImplementation((invs) => invs),
      create: jest.fn().mockImplementation((data) => ({ id: 'new-invitation-uuid', ...data })),
    };

    mockOutboxRepository = {
      save: jest.fn().mockImplementation((o) => o),
      create: jest.fn().mockImplementation((o) => o),
    };

    mockSessionService = {
      revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    };

    mockSystemRoleSeederService = {
      seedBaselineSystemRoles: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningApplicationService,
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: EmployeeReferenceRepository, useValue: mockEmployeeReferenceRepository },
        { provide: AuthSecurityEventOutboxRepository, useValue: mockOutboxRepository },
        { provide: InvitationRepository, useValue: mockInvitationRepository },
        { provide: SessionApplicationService, useValue: mockSessionService },
        { provide: SystemRoleSeederService, useValue: mockSystemRoleSeederService },
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
    it('should return DUPLICATE if root admin already exists', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(new User());

      const result = await service.bootstrapRootAdmin({
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'root@tenant.com',
      });

      expect(result).toEqual({ success: true, reason: 'DUPLICATE' });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ protectedRootAdmin: true });
    });

    it('should throw BadRequestException if rootAdminEmail is missing', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.bootstrapRootAdmin({
          tenantCode: 'TENANT_A',
          rootAdminEmail: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if rootAdminEmail format is invalid', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.bootstrapRootAdmin({
          tenantCode: 'TENANT_A',
          rootAdminEmail: 'invalid-email',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create root admin and seed system roles successfully', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.bootstrapRootAdmin({
        tenantCode: 'TENANT_A',
        rootAdminEmail: 'root@tenant-a.com',
      });

      expect(result).toEqual({ success: true });
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockSystemRoleSeederService.seedBaselineSystemRoles).toHaveBeenCalledWith('TENANT_A');
      expect(mockOutboxRepository.save).toHaveBeenCalled();
    });
  });

  describe('synchronizeEmployeeStatus - US1 Suspension', () => {
    it('should return true if employee reference not found', async () => {
      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(null);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_SUSPENDED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockEmployeeReferenceRepository.findById).toHaveBeenCalledWith('emp-123');
    });

    it('should return true if event version is less than or equal to stored version', async () => {
      const existingRef = new EmployeeReference();
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '10';

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_SUSPENDED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
    });

    it('should suspend user, bump security version, write outbox and clear sessions post-commit', async () => {
      const existingRef = new EmployeeReference();
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '9';

      const existingUser = new User();
      existingUser.id = 'user-123';
      existingUser.tenantCode = 'TENANT_A';
      existingUser.status = UserStatus.ACTIVE;
      existingUser.securityVersion = 1;

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_SUSPENDED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
        securityVersion: 1,
        status: UserStatus.DISABLED,
      });
      expect(mockEmployeeReferenceRepository.update).toHaveBeenCalledWith('emp-123', {
        status: EmployeeStatus.SUSPENDED,
        sourceVersion: '10',
      });

      expect(mockOutboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.AUTHENTICATION_SESSIONS_REVOKED,
          userId: 'user-123',
        }),
      );
      expect(mockSessionService.revokeAllSessions).toHaveBeenCalledWith('TENANT_A', 'user-123');
    });

    it('should terminate user, bump security version, revoke active invitations, write outbox and clear sessions post-commit', async () => {
      const existingRef = new EmployeeReference();
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '9';

      const existingUser = new User();
      existingUser.id = 'user-123';
      existingUser.tenantCode = 'TENANT_A';
      existingUser.status = UserStatus.ACTIVE;
      existingUser.securityVersion = 2;

      const mockInvitation = new Invitation();
      mockInvitation.userId = 'user-123';
      mockInvitation.status = InvitationStatus.PENDING;

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);
      mockInvitationRepository.find.mockResolvedValueOnce([mockInvitation]);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_TERMINATED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
        securityVersion: 2,
        status: UserStatus.ARCHIVED,
      });
      expect(mockEmployeeReferenceRepository.update).toHaveBeenCalledWith('emp-123', {
        status: EmployeeStatus.TERMINATED,
        sourceVersion: '10',
      });

      expect(mockInvitationRepository.find).toHaveBeenCalledWith({
        userId: 'user-123',
        status: InvitationStatus.PENDING,
      });
      expect(mockInvitationRepository.bulkSave).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-123',
          status: InvitationStatus.REVOKED,
          revokedAt: expect.any(Date),
        }),
      ]);

      expect(mockOutboxRepository.create).toHaveBeenCalledWith(
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
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '9';

      const existingUser = new User();
      existingUser.id = 'user-123';
      existingUser.tenantCode = 'TENANT_A';
      existingUser.status = UserStatus.ARCHIVED;
      existingUser.securityVersion = 3;
      existingUser.displayEmail = 'rehire@tenant.com';
      existingUser.normalizedEmail = 'rehire@tenant.com';

      const mockInvitation = new Invitation();
      mockInvitation.userId = 'user-123';
      mockInvitation.status = InvitationStatus.PENDING;

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);
      mockInvitationRepository.find.mockResolvedValueOnce([mockInvitation]);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_REACTIVATED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-123', {
        status: UserStatus.INACTIVE,
        securityVersion: 3,
      });
      expect(mockEmployeeReferenceRepository.update).toHaveBeenCalledWith('emp-123', {
        status: EmployeeStatus.REACTIVATED,
        sourceVersion: '10',
      });

      expect(mockInvitationRepository.find).toHaveBeenCalledWith({
        userId: 'user-123',
        status: InvitationStatus.PENDING,
      });
      // Verify revoke old invitations
      expect(mockInvitationRepository.bulkSave).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-123',
          status: InvitationStatus.REVOKED,
          revokedAt: expect.any(Date),
        }),
      ]);

      // Verify create new invitation
      expect(mockInvitationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          status: InvitationStatus.PENDING,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );

      // Verify write user-invited to outbox
      expect(mockOutboxRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventType.AUTHENTICATION_USER_INVITED,
          userId: 'user-123',
          sanitizedPayload: expect.objectContaining({
            userId: 'user-123',
            email: 'rehire@tenant.com',
            invitationId: 'new-invitation-uuid',
          }),
        }),
      );
    });
  });

  describe('synchronizeEmployeeStatus - Missing User Reference', () => {
    it('should update employee reference to suspended if user is missing', async () => {
      const existingRef = new EmployeeReference();
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '9';

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_SUSPENDED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockEmployeeReferenceRepository.update).toHaveBeenCalledWith('emp-123', {
        status: EmployeeStatus.SUSPENDED,
        sourceVersion: '10',
      });
    });

    it('should update employee reference to terminated if user is missing', async () => {
      const existingRef = new EmployeeReference();
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '9';

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_TERMINATED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockEmployeeReferenceRepository.update).toHaveBeenCalledWith('emp-123', {
        status: EmployeeStatus.TERMINATED,
        sourceVersion: '10',
      });
    });

    it('should update employee reference to reactivated if user is missing', async () => {
      const existingRef = new EmployeeReference();
      existingRef.id = 'emp-123';
      existingRef.sourceVersion = '9';

      mockEmployeeReferenceRepository.findById.mockResolvedValueOnce(existingRef);
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.synchronizeEmployeeStatus(EventType.EMPLOYEE_REACTIVATED, {
        id: 'emp-123',
        sourceVersion: 10,
      });

      expect(result).toBe(true);
      expect(mockEmployeeReferenceRepository.update).toHaveBeenCalledWith('emp-123', {
        status: EmployeeStatus.REACTIVATED,
        sourceVersion: '10',
      });
    });
  });
});
