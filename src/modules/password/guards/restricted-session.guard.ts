import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { Request } from 'express';

import { SessionState } from '../../../enums';
import {
  AuthSessionExpiredError,
  AuthStoreUnavailableError,
} from '../exceptions/password.exception';

export interface RestrictedSessionRequest extends Request {
  session?: {
    userId: string;
    tenantCode: string;
    flowId: string;
  };
}

@Injectable()
export class RestrictedSessionGuard implements CanActivate {
  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RestrictedSessionRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthSessionExpiredError('Missing or invalid authorization header');
    }
    const token = authHeader.split(' ')[1];
    const redisKey = `auth:sso-setup:${token}`;

    let sessionData: Record<string, string>;
    try {
      const provider = this.redisCacheProvider as unknown as {
        getClient?(): { hgetall(key: string): Promise<Record<string, string>> } | null;
        client?: { hgetall(key: string): Promise<Record<string, string>> } | null;
      };
      const client = provider.getClient?.() ?? provider.client ?? null;
      if (!client) {
        throw new AuthStoreUnavailableError();
      }
      sessionData = await client.hgetall(redisKey);
    } catch (err) {
      if (err instanceof AuthSessionExpiredError || err instanceof AuthStoreUnavailableError) {
        throw err;
      }
      // eslint-disable-next-line no-console
      console.error('Redis lookup failure in RestrictedSessionGuard:', err);
      throw new AuthStoreUnavailableError();
    }

    if (
      !sessionData ||
      !sessionData.userId ||
      !sessionData.tenantCode ||
      sessionData.authState !== SessionState.SSO_SETUP_PENDING
    ) {
      throw new AuthSessionExpiredError();
    }

    // Attach session details to the request object for use in the controller/service
    request.session = {
      userId: sessionData.userId,
      tenantCode: sessionData.tenantCode,
      flowId: token,
    };

    return true;
  }
}
