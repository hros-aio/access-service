import crypto from 'crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { CredentialStatus, EventType, InvitationStatus, UserStatus } from '../../../enums';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { SessionApplicationService } from '../../auth/services/session.application.service';
import { EmployeeReferenceRepository } from '../../employee/repositories/employee-reference.repository';
import { Invitation } from '../../invite/entities/invitation.entity';
import { InvitationRepository } from '../../invite/repositories/invitation.repository';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repositories/user.repository';
import { ConsumedEvent } from '../entities/consumed-event.entity';
import { ConsumedEventRepository } from '../repositories/consumed-event.repository';

@Injectable()
export class ProvisioningApplicationService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly userRepository: UserRepository,
    private readonly employeeReferenceRepository: EmployeeReferenceRepository,
    private readonly consumedEventRepository: ConsumedEventRepository,
    private readonly authSecurityEventOutboxRepository: AuthSecurityEventOutboxRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly sessionService: SessionApplicationService,
  ) {}

  async bootstrapRootAdmin(
    eventId: string,
    topic: string,
    payload: { tenantCode: string; rootAdminEmail: string },
  ): Promise<{ success: boolean; reason?: string }> {
    return this.transactionService.runInTransaction(async () => {
      // 1. Idempotency Check
      const alreadyProcessed = await this.consumedEventRepository.exists(eventId);
      if (alreadyProcessed) {
        return { success: true, reason: 'DUPLICATE' };
      }

      const { tenantCode, rootAdminEmail } = payload;
      if (!rootAdminEmail) {
        throw new BadRequestException('rootAdminEmail is required');
      }

      // 2. Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rootAdminEmail)) {
        throw new BadRequestException('Invalid rootAdminEmail format');
      }

      // 3. Concurrency Lock: Check if a root admin already exists
      const existingRootAdmin = await this.userRepository.findOneWithOptions({
        where: { tenantCode, protectedRootAdmin: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (existingRootAdmin) {
        const consumed = new ConsumedEvent();
        consumed.id = eventId;
        consumed.topic = topic;
        await this.consumedEventRepository.save(consumed);
        return { success: true, reason: 'ALREADY_EXISTS' };
      }

      // 4. Create new root admin User
      const newUser = new User();
      newUser.tenantCode = tenantCode;
      newUser.displayEmail = rootAdminEmail;
      newUser.normalizedEmail = rootAdminEmail.toLowerCase().trim();
      newUser.status = UserStatus.ACTIVE;
      newUser.userType = 'admin';
      newUser.credentialStatus = CredentialStatus.PENDING;
      newUser.protectedRootAdmin = true;
      newUser.securityVersion = 1;

      const savedUser = await this.userRepository.save(newUser);

      // 5. Append security outbox event
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

      // 6. Record consumed event
      const consumed = new ConsumedEvent();
      consumed.id = eventId;
      consumed.topic = topic;
      await this.consumedEventRepository.save(consumed);

      return { success: true };
    });
  }

  async synchronizeEmployeeStatus(
    eventId: string,
    eventType: string,
    payload: { employeeId: string; tenantCode: string; sourceVersion: number },
  ): Promise<{ success: boolean; reason?: string }> {
    // 1. Idempotency Check
    const alreadyProcessed = await this.consumedEventRepository.exists(eventId);
    if (alreadyProcessed) {
      return { success: true, reason: 'DUPLICATE' };
    }

    const { employeeId, tenantCode, sourceVersion } = payload;
    let userIdToRevoke: string | null = null;

    const result = await this.transactionService.runInTransaction(async () => {
      // 2. Lock & Retrieve EmployeeReference
      const employeeRef = await this.employeeReferenceRepository.findOne({
        where: { employeeId, tenantCode },
        lock: { mode: 'pessimistic_write' },
      });

      if (!employeeRef) {
        return { success: true, reason: 'UNKNOWN_EMPLOYEE_REFERENCE' };
      }

      // 3. Event Ordering/Idempotency validation
      const currentStoredVersion = employeeRef.sourceVersion
        ? parseInt(employeeRef.sourceVersion, 10)
        : 0;
      if (sourceVersion <= currentStoredVersion) {
        return { success: true, reason: 'STALE_VERSION' };
      }

      // 4. Retrieve User associated with this employee
      const user = await this.userRepository.findOneWithOptions({
        where: { tenantCode, employeeRefId: employeeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        // Just update employeeRef version/status and return
        employeeRef.sourceVersion = sourceVersion.toString();
        if (eventType === EventType.EMPLOYEE_SUSPENDED) {
          employeeRef.status = 'suspended';
        } else if (eventType === EventType.EMPLOYEE_TERMINATED) {
          employeeRef.status = 'terminated';
        } else if (eventType === EventType.EMPLOYEE_REACTIVATED) {
          employeeRef.status = 'reactivated';
        }
        await this.employeeReferenceRepository.save(employeeRef);

        const consumed = new ConsumedEvent();
        consumed.id = eventId;
        consumed.topic = 'employee.lifecycle-events';
        await this.consumedEventRepository.save(consumed);

        return { success: true };
      }

      userIdToRevoke = user.id;

      // 5. Update state for US1 Suspension
      if (eventType === EventType.EMPLOYEE_SUSPENDED) {
        user.status = UserStatus.DISABLED;
        user.securityVersion += 1;
        employeeRef.status = 'suspended';

        await this.userRepository.save(user);
        employeeRef.sourceVersion = sourceVersion.toString();
        await this.employeeReferenceRepository.save(employeeRef);

        // Write outbox security event
        const outbox = new AuthSecurityEventOutbox();
        outbox.tenantCode = tenantCode;
        outbox.userId = user.id;
        outbox.eventType = EventType.AUTHENTICATION_SESSIONS_REVOKED;
        outbox.sanitizedPayload = {
          userId: user.id,
          tenantCode,
          reason: 'EMPLOYMENT_STATUS_CHANGED',
          newStatus: 'DISABLED',
        };
        outbox.publishStatus = 'pending';
        await this.authSecurityEventOutboxRepository.save(outbox);
      }

      // 5. Update state for US2 Termination
      if (eventType === EventType.EMPLOYEE_TERMINATED) {
        user.status = UserStatus.ARCHIVED;
        user.securityVersion += 1;
        employeeRef.status = 'terminated';

        await this.userRepository.save(user);
        employeeRef.sourceVersion = sourceVersion.toString();
        await this.employeeReferenceRepository.save(employeeRef);

        // Revoke active/pending invitations
        const invitations = await this.invitationRepository.find({
          where: { userId: user.id, status: InvitationStatus.PENDING },
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
        outbox.tenantCode = tenantCode;
        outbox.userId = user.id;
        outbox.eventType = EventType.AUTHENTICATION_SESSIONS_REVOKED;
        outbox.sanitizedPayload = {
          userId: user.id,
          tenantCode,
          reason: 'EMPLOYMENT_STATUS_CHANGED',
          newStatus: 'ARCHIVED',
        };
        outbox.publishStatus = 'pending';
        await this.authSecurityEventOutboxRepository.save(outbox);
      }

      // 5. Update state for US3 Reactivation
      if (eventType === EventType.EMPLOYEE_REACTIVATED) {
        user.status = UserStatus.INVITED;
        user.securityVersion += 1;
        employeeRef.status = 'reactivated';

        await this.userRepository.save(user);
        employeeRef.sourceVersion = sourceVersion.toString();
        await this.employeeReferenceRepository.save(employeeRef);

        // Revoke old active/pending invitations
        const invitations = await this.invitationRepository.find({
          where: { userId: user.id, status: InvitationStatus.PENDING },
        });
        if (invitations.length > 0) {
          for (const invite of invitations) {
            invite.status = InvitationStatus.REVOKED;
            invite.revokedAt = new Date();
          }
          await this.invitationRepository.bulkSave(invitations);
        }

        // Create new pending invitation
        const newInvite = new Invitation();
        newInvite.userId = user.id;
        newInvite.status = InvitationStatus.PENDING;
        const randomToken = crypto.randomBytes(32).toString('hex');
        newInvite.tokenHash = crypto.createHash('sha256').update(randomToken).digest('hex');
        newInvite.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        newInvite.version = 1;
        const savedInvite = await this.invitationRepository.save(newInvite);

        // Write outbox security event (user-invited)
        const outbox = new AuthSecurityEventOutbox();
        outbox.tenantCode = tenantCode;
        outbox.userId = user.id;
        outbox.eventType = EventType.AUTHENTICATION_USER_INVITED;
        outbox.sanitizedPayload = {
          userId: user.id,
          tenantCode,
          invitationId: savedInvite.id,
          email: user.displayEmail,
        };
        outbox.publishStatus = 'pending';
        await this.authSecurityEventOutboxRepository.save(outbox);
      }

      // 6. Record consumed event
      const consumed = new ConsumedEvent();
      consumed.id = eventId;
      consumed.topic = 'employee.lifecycle-events';
      await this.consumedEventRepository.save(consumed);

      return { success: true };
    });

    // 7. Revoke active sessions in Redis post-commit
    if (result.success && !result.reason && userIdToRevoke) {
      if (
        eventType === EventType.EMPLOYEE_SUSPENDED ||
        eventType === EventType.EMPLOYEE_TERMINATED
      ) {
        await this.sessionService.revokeAllSessions(tenantCode, userIdToRevoke);
      }
    }

    return result;
  }
}
