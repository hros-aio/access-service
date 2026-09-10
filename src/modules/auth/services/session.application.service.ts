import { Injectable } from '@nestjs/common';
import { CACHE_KEY_BUILDER, RedisCacheProvider } from '@new-hros/libs-core';

@Injectable()
export class SessionApplicationService {
  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  async revokeAllSessions(tenantCode: string, userId: string): Promise<void> {
    const client = this.redisCacheProvider.getClient();
    if (!client) {
      return;
    }

    const setKey = CACHE_KEY_BUILDER.buildUserSessions(tenantCode, userId);
    const sessionIds: string[] = await client.smembers(setKey);
    if (sessionIds && sessionIds.length > 0) {
      const keys = sessionIds.map((sid) => CACHE_KEY_BUILDER.buildSession(sid));
      await client.del(...keys, setKey);
    }
  }
}
