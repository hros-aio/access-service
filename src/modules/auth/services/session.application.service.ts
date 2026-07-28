import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

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

    const setKey = `auth:user-sessions:${tenantCode}:${userId}`;
    const sessionIds: string[] = await client.smembers(setKey);
    if (sessionIds && sessionIds.length > 0) {
      const keys = sessionIds.map((sid) => `auth:session:${sid}`);
      await client.del(...keys, setKey);
    }
  }
}
