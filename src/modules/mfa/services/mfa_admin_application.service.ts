import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { DataSource } from 'typeorm';

import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
import { MfaMethodRepository } from '../repositories/mfa-method.repository';

@Injectable()
export class MfaAdminApplicationService {
  constructor(
    private readonly mfaRepository: MfaMethodRepository,
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly dataSource: DataSource,
  ) {}

  public async resetUserMfa(
    tenantCode: string,
    targetUserId: string,
    adminUserId: string,
  ): Promise<{
    success: boolean;
    targetUserId: string;
    resetAt: Date;
    revokedSessionsCount: number;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Soft-delete / disable all user MFA methods
      await this.mfaRepository.disableAllUserFactors(tenantCode, targetUserId);

      // 2. Increment security_version in users table
      const userUpdateResult = await queryRunner.manager.query(
        `UPDATE "users" SET "security_version" = "security_version" + 1 WHERE "id" = $1 AND "tenant_code" = $2 RETURNING "id"`,
        [targetUserId, tenantCode],
      );

      const updatedRows = Array.isArray(userUpdateResult)
        ? Array.isArray(userUpdateResult[0])
          ? userUpdateResult[0]
          : userUpdateResult
        : [];

      if (updatedRows.length === 0) {
        throw new NotFoundException('Target user not found in admin tenant context');
      }

      // 3. Write authentication.mfa-reset outbox event
      const resetAt = new Date();
      await queryRunner.manager.query(
        `INSERT INTO "auth_security_events_outbox" ("tenant_code", "user_id", "event_type", "sanitized_payload", "publish_status", "attempt_count")
         VALUES ($1, $2, $3, $4, 'pending', 0)`,
        [
          tenantCode,
          targetUserId,
          'authentication.mfa-reset',
          JSON.stringify({
            tenantCode,
            targetUserId,
            adminUserId,
            resetAt: resetAt.toISOString(),
          }),
        ],
      );

      await queryRunner.commitTransaction();

      // 4. Revoke active Redis sessions
      let revokedCount = 0;
      try {
        const provider = this.redisCacheProvider as unknown as {
          getClient?(): {
            smembers(key: string): Promise<string[]>;
            del(key: string): Promise<number>;
          } | null;
        };
        const client = provider.getClient?.();
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
      } catch (redisError) {
        // Fallback safety for session cleanup
      }

      return {
        success: true,
        targetUserId,
        resetAt,
        revokedSessionsCount: revokedCount,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
