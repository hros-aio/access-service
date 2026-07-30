import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';
import { Request } from 'express';

import {
  AuthSessionExpiredError,
  AuthStoreUnavailableError,
} from '../exceptions/password.exception';

@Injectable()
export class RestrictedSessionGuard implements CanActivate {
  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthSessionExpiredError('Missing or invalid authorization header');
    }
    const token = authHeader.split(' ')[1];
    const redisKey = `auth:sso-setup:${token}`;

    let sessionData: Record<string, string>;
    try {
      const provider = this.redisCacheProvider as unknown as {
        client?: { hgetall(key: string): Promise<Record<string, string>> };
      };
      const client = provider.client;
      if (!client) {
        throw new AuthStoreUnavailableError();
      }
      sessionData = await client.hgetall(redisKey);
    } catch (err) {
      if (err instanceof AuthSessionExpiredError || err instanceof AuthStoreUnavailableError) {
        throw err;
      }
      throw new AuthStoreUnavailableError();
    }

    if (
      !sessionData ||
      !sessionData.userId ||
      !sessionData.tenantCode ||
      sessionData.authState !== 'sso-setup-pending'
    ) {
      throw new AuthSessionExpiredError();
    }

    // Attach session details to the request object for use in the controller/service
    (
      request as Request & { session?: { userId: string; tenantCode: string; flowId: string } }
    ).session = {
      userId: sessionData.userId,
      tenantCode: sessionData.tenantCode,
      flowId: token,
    };

    return true;
  }
}
