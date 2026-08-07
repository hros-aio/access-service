import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';

@Injectable()
export class SessionApplicationService {
  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  async revokeAllSessions(tenantCode: string, userId: string): Promise<void> {
    const provider = this.redisCacheProvider as unknown as {
      client?: {
        smembers(key: string): Promise<string[]>;
        del(...keys: string[]): Promise<number>;
      };
    };
    const client = provider.client;
    if (!client) {
      return;
    }

    const setKey = GenerateUserSessionsKey(tenantCode, userId);
    const sessionIds: string[] = await client.smembers(setKey);
    if (sessionIds && sessionIds.length > 0) {
      const keys = sessionIds.map((sid) => GenerateSessionKey(sid));
      await client.del(...keys, setKey);
    }
  }
}
