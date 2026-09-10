import { Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_KEY_BUILDER, RedisCacheProvider, RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { MfaMethodRepository } from '../repositories/mfa-method.repository';

import { AuthSecurityEventOutboxRepository } from '@/modules/security-event';
import { UserRepository } from '@/modules/user/repositories/user.repository';

@Injectable()
export class MfaAdminApplicationService {
  constructor(
    private readonly mfaRepository: MfaMethodRepository,
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly transactionService: TransactionService,
    private readonly userRepository: UserRepository,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
  ) {}

  public async resetUserMfa(targetUserId: string): Promise<{
    resetAt: Date;
    revokedSessionsCount: number;
  }> {
    const tenantCode = RequestContextService.getTenantCode();
    const adminUserId = RequestContextService.getUser()?.userId;

    return this.transactionService.runInTransaction(async () => {
      await this.mfaRepository.disableAllUserFactors(targetUserId);

      const rowAffected = await this.userRepository.incrementSecurityVersionById(targetUserId);
      if (!rowAffected) {
        throw new NotFoundException('Target user not found in admin tenant context');
      }

      // 3. Write authentication.mfa-reset outbox event
      const resetAt = new Date();
      await this.outboxRepository.create({
        tenantCode,
        userId: targetUserId,
        eventType: 'authentication.mfa-reset',
        sanitizedPayload: {
          tenantCode,
          targetUserId,
          adminUserId,
          resetAt: resetAt.toISOString(),
        },
        publishStatus: 'pending',
      });

      // 4. Revoke active Redis sessions
      let revokedCount = 0;
      const client = this.redisCacheProvider.getClient();
      const userSessionsKey = CACHE_KEY_BUILDER.buildUserSessions(tenantCode, targetUserId);

      if (client) {
        const sessionIds: string[] = await client.smembers(userSessionsKey);
        if (sessionIds && sessionIds.length > 0) {
          revokedCount = sessionIds.length;
          for (const sid of sessionIds) {
            await client.del(CACHE_KEY_BUILDER.buildSession(sid));
          }
          await client.del(userSessionsKey);
        }
      }

      return {
        resetAt,
        revokedSessionsCount: revokedCount,
      };
    });
  }
}
