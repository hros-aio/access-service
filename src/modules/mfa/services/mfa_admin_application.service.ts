import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisCacheProvider, RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { MfaMethodRepository } from '../repositories/mfa-method.repository';

import { GenerateSessionKey, GenerateUserSessionsKey } from '@/constants';
import { UserRepository } from '@/modules/user/repositories/user.repository';

@Injectable()
export class MfaAdminApplicationService {
  constructor(
    private readonly mfaRepository: MfaMethodRepository,
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly transactionService: TransactionService,
    private readonly userRepository: UserRepository,
  ) {}

  public async resetUserMfa(targetUserId: string): Promise<{
    resetAt: Date;
    revokedSessionsCount: number;
  }> {
    const tenantCode = RequestContextService.getTenantCode();
    return this.transactionService.runInTransaction(async () => {
      await this.mfaRepository.disableAllUserFactors(targetUserId);

      const rowAffected = await this.userRepository.incrementSecurityVersionById(targetUserId);
      if (!rowAffected) {
        throw new NotFoundException('Target user not found in admin tenant context');
      }

      // 3. Write authentication.mfa-reset outbox event
      //   const resetAt = new Date();
      //   await queryRunner.manager.query(
      //     `INSERT INTO "auth_security_events_outbox" ("tenant_code", "user_id", "event_type", "sanitized_payload", "publish_status", "attempt_count")
      //      VALUES ($1, $2, $3, $4, 'pending', 0)`,
      //     [
      //       tenantCode,
      //       targetUserId,
      //       'authentication.mfa-reset',
      //       JSON.stringify({
      //         tenantCode,
      //         targetUserId,
      //         adminUserId,
      //         resetAt: resetAt.toISOString(),
      //       }),
      //     ],
      //   );

      // 4. Revoke active Redis sessions
      let revokedCount = 0;
      const client = this.redisCacheProvider.getClient();
      const userSessionsKey = GenerateUserSessionsKey(tenantCode, targetUserId);

      if (client) {
        const sessionIds: string[] = await client.smembers(userSessionsKey);
        if (sessionIds && sessionIds.length > 0) {
          revokedCount = sessionIds.length;
          for (const sid of sessionIds) {
            await client.del(GenerateSessionKey(sid));
          }
          await client.del(userSessionsKey);
        }
      }

      return {
        resetAt: new Date(),
        revokedSessionsCount: revokedCount,
      };
    });
  }
}
