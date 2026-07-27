import { Injectable, BadRequestException } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { UserRepository } from '../../user/repositories/user.repository';
import { ConsumedEventRepository } from '../repositories/consumed-event.repository';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { ConsumedEvent } from '../entities/consumed-event.entity';
import { User } from '../../user/entities/user.entity';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';

@Injectable()
export class ProvisioningApplicationService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly userRepository: UserRepository,
    private readonly consumedEventRepository: ConsumedEventRepository,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
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
      const usersRepo = this.transactionService.getManager().getRepository(User);
      const existingRootAdmin = await usersRepo.findOne({
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
      newUser.status = 'active';
      newUser.userType = 'admin';
      newUser.credentialStatus = 'pending';
      newUser.protectedRootAdmin = true;
      newUser.securityVersion = 1;
      
      const savedUser = await usersRepo.save(newUser);

      // 5. Append security outbox event
      const outbox = new AuthSecurityEventOutbox();
      outbox.tenantCode = tenantCode;
      outbox.userId = savedUser.id;
      outbox.eventType = 'authentication.user-provisioned';
      outbox.sanitizedPayload = {
        userId: savedUser.id,
        tenantCode,
        email: savedUser.normalizedEmail,
        accountType: 'BUILT_IN_ADMIN',
        status: 'ACTIVE',
      };
      outbox.publishStatus = 'pending';

      const outboxRepo = this.transactionService.getManager().getRepository(AuthSecurityEventOutbox);
      await outboxRepo.save(outbox);

      // 6. Record consumed event
      const consumed = new ConsumedEvent();
      consumed.id = eventId;
      consumed.topic = topic;
      await this.consumedEventRepository.save(consumed);

      return { success: true };
    });
  }
}
