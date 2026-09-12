import crypto from 'crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { isEmail } from 'class-validator';

import { SystemRoleSeederService } from './system-role-seeder.service';
import { CredentialStatus, EventType, InvitationStatus, UserStatus } from '../../../enums';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { InvitationRepository } from '../../invite/repositories/invitation.repository';
import { AuthSecurityEventOutbox, AuthSecurityEventOutboxRepository } from '../../security-event';
import { UserRepository } from '../../user/repositories/user.repository';
import { TenantCreatedPayload } from '../interfaces/tenant-created.interface';

import { EmployeeStatus } from '@/enums/employee-status.enum';
import { EmployeeReference } from '@/modules/employee/entities/employee-reference.entity';
import { User } from '@/modules/user/entities/user.entity';

@Injectable()
export class ProvisioningApplicationService {
  private readonly logger = new Logger(ProvisioningApplicationService.name);
  constructor(
    private readonly transactionService: TransactionService,
    private readonly userRepository: UserRepository,
    private readonly employeeReferenceRepository: EmployeeReferenceRepository,
    private readonly authSecurityEventOutboxRepository: AuthSecurityEventOutboxRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly sessionService: SessionApplicationService,
    private readonly systemRoleSeederService: SystemRoleSeederService,
  ) {}

  async bootstrapRootAdmin(
    payload: TenantCreatedPayload,
  ): Promise<{ success: boolean; reason?: string }> {
    return this.transactionService.runInTransaction(async () => {
      // 1. Idempotency Check
      const alreadyRootAdmin = await this.userRepository.findOne({ protectedRootAdmin: true });
      if (alreadyRootAdmin) {
        this.logger.warn('Protected root admin already exists', { payload });
        return { success: true, reason: 'DUPLICATE' };
      }

      // 2. Validate email format
      const { tenantCode, rootAdminEmail } = payload;
      if (!rootAdminEmail || !isEmail(rootAdminEmail)) {
        this.logger.error('RootAdminEmail is invalid', { payload });
        throw new BadRequestException('rootAdminEmail is required');
      }

      // 3. Create new root admin User
      const savedUser = await this.userRepository.create({
        displayEmail: rootAdminEmail,
        normalizedEmail: rootAdminEmail.toLowerCase().trim(),
        status: UserStatus.ACTIVE,
        userType: 'admin',
        credentialStatus: CredentialStatus.PENDING,
        protectedRootAdmin: true,
        securityVersion: 1,
      });

      // 5. Seed default baseline System Roles for the newly provisioned tenant
      await this.systemRoleSeederService.seedBaselineSystemRoles(tenantCode);

      // 6. Append security outbox event
      const outbox = new AuthSecurityEventOutbox();
      outbox.tenantCode = tenantCode;
      outbox.userId = savedUser.id;
      outbox.eventType = EventType.AUTHENTICATION_USER_PROVISIONED;
      outbox.sanitizedPayload = {
        userId: savedUser.id,
        tenantCode,
        email: savedUser.normalizedEmail,
        accountType: 'BUILT_IN_ADMIN',
        status: 'ACTIVE',
      };
      outbox.publishStatus = 'pending';

      await this.authSecurityEventOutboxRepository.save(outbox);

      return { success: true };
    });
  }

  async synchronizeEmployeeStatus(
    eventType: string,
    payload: { id: string; sourceVersion: number },
  ): Promise<boolean> {
    const { id, sourceVersion } = payload;
    const result = await this.transactionService.runInTransaction(async () => {
      // 2. Lock & Retrieve EmployeeReference
      const employeeRef = await this.employeeReferenceRepository.findById(id);
      if (!employeeRef) {
        this.logger.error('Employee reference not found', { payload });
        return true;
      }

      // 3. Event Ordering/Idempotency validation
      const currentStoredVersion = employeeRef.sourceVersion
        ? parseInt(employeeRef.sourceVersion, 10)
        : 0;
      if (sourceVersion <= currentStoredVersion) {
        this.logger.warn('Employee has project version', { payload, currentStoredVersion });
        return true;
      }

      // 4. Retrieve User associated with this employee
      const user = await this.userRepository.findOne({ employeeRefId: id });
      if (!user) {
        // Just update employeeRef version/status and return
        let status;
        employeeRef.sourceVersion = sourceVersion.toString();
        if (eventType === EventType.EMPLOYEE_SUSPENDED) {
          status = EmployeeStatus.SUSPENDED;
        } else if (eventType === EventType.EMPLOYEE_TERMINATED) {
          status = EmployeeStatus.TERMINATED;
        } else if (eventType === EventType.EMPLOYEE_REACTIVATED) {
          status = EmployeeStatus.REACTIVATED;
        }
        await this.employeeReferenceRepository.update(employeeRef.id, {
          status,
          sourceVersion: sourceVersion.toString(),
        });

        return true;
      }

      switch (eventType) {
        case EventType.EMPLOYEE_SUSPENDED:
          return this.suspendUserAndEmployee(user, employeeRef, sourceVersion.toString());
        case EventType.EMPLOYEE_TERMINATED:
          return this.terminateUserAndEmployee(user, employeeRef, sourceVersion.toString());
        case EventType.EMPLOYEE_REACTIVATED:
          return this.reactivateUserAndEmployee(user, employeeRef, sourceVersion.toString());
      }

      return false;
    });

    return result;
  }

  private async suspendUserAndEmployee(
    user: User,
    employeeRef: EmployeeReference,
    sourceVersion: string,
  ): Promise<boolean> {
    await this.userRepository.update(user.id, {
      securityVersion: user.securityVersion++,
      status: UserStatus.DISABLED,
    });

    await this.employeeReferenceRepository.update(employeeRef.id, {
      status: EmployeeStatus.SUSPENDED,
      sourceVersion,
    });

    // Write outbox security event
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = user.tenantCode;
    outbox.userId = user.id;
    outbox.eventType = EventType.AUTHENTICATION_SESSIONS_REVOKED;
    outbox.sanitizedPayload = {
      userId: user.id,
      tenantCode: user.tenantCode,
      reason: 'EMPLOYMENT_STATUS_CHANGED',
      newStatus: 'DISABLED',
    };
    outbox.publishStatus = 'pending';
    await this.authSecurityEventOutboxRepository.create(outbox);

    // Revoke active session
    await this.sessionService.revokeAllSessions(user.tenantCode, user.id);

    return true;
  }

  private async terminateUserAndEmployee(
    user: User,
    employeeRef: EmployeeReference,
    sourceVersion: string,
  ): Promise<boolean> {
    await this.userRepository.update(user.id, {
      securityVersion: user.securityVersion++,
      status: UserStatus.ARCHIVED,
    });

    await this.employeeReferenceRepository.update(employeeRef.id, {
      status: EmployeeStatus.TERMINATED,
      sourceVersion,
    });

    // Revoke active/pending invitations
    const invitations = await this.invitationRepository.find({
      userId: user.id,
      status: InvitationStatus.PENDING,
    });
    if (invitations.length > 0) {
      for (const invite of invitations) {
        invite.status = InvitationStatus.REVOKED;
        invite.revokedAt = new Date();
      }
      await this.invitationRepository.bulkSave(invitations);
    }

    // Write outbox security event
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = user.tenantCode;
    outbox.userId = user.id;
    outbox.eventType = EventType.AUTHENTICATION_SESSIONS_REVOKED;
    outbox.sanitizedPayload = {
      userId: user.id,
      tenantCode: user.tenantCode,
      reason: 'EMPLOYMENT_STATUS_CHANGED',
      newStatus: 'ARCHIVED',
    };
    outbox.publishStatus = 'pending';
    await this.authSecurityEventOutboxRepository.create(outbox);

    // Revoke active session
    await this.sessionService.revokeAllSessions(user.tenantCode, user.id);

    return true;
  }

  private async reactivateUserAndEmployee(
    user: User,
    employeeRef: EmployeeReference,
    sourceVersion: string,
  ): Promise<boolean> {
    await this.userRepository.update(user.id, {
      status: UserStatus.INACTIVE,
      securityVersion: user.securityVersion++,
    });

    await this.employeeReferenceRepository.update(employeeRef.id, {
      status: EmployeeStatus.REACTIVATED,
      sourceVersion,
    });

    // Revoke old active/pending invitations
    const invitations = await this.invitationRepository.find({
      userId: user.id,
      status: InvitationStatus.PENDING,
    });
    if (invitations.length > 0) {
      for (const invite of invitations) {
        invite.status = InvitationStatus.REVOKED;
        invite.revokedAt = new Date();
      }
      await this.invitationRepository.bulkSave(invitations);
    }

    // Create new pending invitation
    const randomToken = crypto.randomBytes(32).toString('hex');
    const savedInvite = await this.invitationRepository.create({
      userId: user.id,
      status: InvitationStatus.PENDING,
      tokenHash: crypto.createHash('sha256').update(randomToken).digest('hex'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      version: 1,
    });

    // Write outbox security event (user-invited)
    const outbox = new AuthSecurityEventOutbox();
    outbox.tenantCode = user.tenantCode;
    outbox.userId = user.id;
    outbox.eventType = EventType.AUTHENTICATION_USER_INVITED;
    outbox.sanitizedPayload = {
      userId: user.id,
      tenantCode: user.tenantCode,
      invitationId: savedInvite.id,
      email: user.displayEmail,
    };
    outbox.publishStatus = 'pending';
    await this.authSecurityEventOutboxRepository.create(outbox);
    return true;
  }
}
