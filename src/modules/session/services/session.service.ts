import { Injectable, Logger, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { RedisSessionAdapter } from '../adapters/redis-session.adapter';
import { LogoutResponseDto } from '../dto/logout-response.dto';
import { ForceLogoutCommand, ISessionService } from '../interfaces/session.interface';

@Injectable()
export class SessionService implements ISessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly redisSessionAdapter: RedisSessionAdapter,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Revokes single device session in Redis and logs an outbox event.
   */
  async logoutCurrentSession(
    tenantCode: string,
    userId: string,
    sessionId: string,
  ): Promise<LogoutResponseDto> {
    try {
      const revokedSessionsCount = await this.redisSessionAdapter.deleteSession(
        tenantCode,
        userId,
        sessionId,
      );

      await this.dataSource.transaction(async (manager: EntityManager) => {
        await manager.query(
          `INSERT INTO "auth_security_events_outbox" 
           ("tenant_code", "user_id", "event_type", "event_version", "sanitized_payload", "publish_status", "attempt_count")
           VALUES ($1, $2, $3, $4, $5, 'pending', 0)`,
          [
            tenantCode,
            userId,
            'authentication.session-revoked',
            1,
            JSON.stringify({
              userId,
              sessionId,
              revokedAt: new Date().toISOString(),
            }),
          ],
        );
      });

      return {
        success: true,
        revokedSessionsCount: revokedSessionsCount || 1,
      };
    } catch (error) {
      if (
        (error as Error).name === 'ServiceUnavailableException' ||
        (error as Error).message?.includes('Redis')
      ) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          errorCode: 'AUTH_SESSION_STORE_UNAVAILABLE',
          message: 'Session store unavailable',
        });
      }
      throw error;
    }
  }

  /**
   * Increments security_version in DB, appends authentication.sessions-revoked to outbox,
   * and purges all active session keys for target user in Redis.
   */
  async revokeAllUserSessions(command: ForceLogoutCommand): Promise<LogoutResponseDto> {
    const { tenantCode, targetUserId, adminUserId, reason } = command;

    let totalRevoked = 0;

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const userUpdateResult = await manager.query(
        `UPDATE "users" 
         SET "security_version" = "security_version" + 1, "updated_at" = NOW() 
         WHERE "tenant_code" = $1 AND "id" = $2 AND "status" = 'active'
         RETURNING "id"`,
        [tenantCode, targetUserId],
      );

      const updatedRows = Array.isArray(userUpdateResult)
        ? Array.isArray(userUpdateResult[0])
          ? userUpdateResult[0]
          : userUpdateResult
        : [];

      if (!updatedRows || updatedRows.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          errorCode: 'USER_NOT_FOUND',
          message: 'User not found within tenant scope',
        });
      }

      await manager.query(
        `INSERT INTO "auth_security_events_outbox" 
         ("tenant_code", "user_id", "event_type", "event_version", "sanitized_payload", "publish_status", "attempt_count")
         VALUES ($1, $2, $3, $4, $5, 'pending', 0)`,
        [
          tenantCode,
          targetUserId,
          'authentication.sessions-revoked',
          1,
          JSON.stringify({
            userId: targetUserId,
            revokedByUserId: adminUserId,
            reason: reason || 'FORCE_LOGOUT',
            revokedAt: new Date().toISOString(),
          }),
        ],
      );
    });

    try {
      totalRevoked = await this.redisSessionAdapter.purgeAllUserSessions(tenantCode, targetUserId);
    } catch (error) {
      this.logger.error(`Redis purge failed during force logout for user ${targetUserId}`, error);
      throw new ServiceUnavailableException({
        statusCode: 503,
        errorCode: 'AUTH_SESSION_STORE_UNAVAILABLE',
        message: 'Session store unavailable',
      });
    }

    return {
      success: true,
      revokedSessionsCount: totalRevoked,
    };
  }
}
