import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

import { GenerateAuthMfaChallengeKey } from '@/constants';

export interface MfaChallengeData {
  challengeId: string;
  tenantCode: string;
  userId: string;
  codeHash: string;
  attemptsLeft: number;
  rememberMe?: boolean;
}

@Injectable()
export class RedisMfaChallengeAdapter {
  private readonly defaultTtl = 300; // 5 minutes

  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  public async getChallenge(
    tenantCode: string,
    userId: string,
    challengeId: string,
  ): Promise<MfaChallengeData | null> {
    try {
      const key = GenerateAuthMfaChallengeKey(tenantCode, userId, challengeId);
      const raw = await this.redisCacheProvider.get<string>(key);
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      throw new ServiceUnavailableException(
        'AUTH_STORE_UNAVAILABLE: Redis unavailable during MFA challenge lookup',
      );
    }
  }

  public async decrementAttempts(data: MfaChallengeData): Promise<number> {
    try {
      const updated = { ...data, attemptsLeft: data.attemptsLeft - 1 };
      const key = GenerateAuthMfaChallengeKey(data.tenantCode, data.userId, data.challengeId);
      if (updated.attemptsLeft <= 0) {
        await this.deleteChallenge(data.tenantCode, data.userId, data.challengeId);
      } else {
        await this.redisCacheProvider.set(key, JSON.stringify(updated), this.defaultTtl);
      }
      return updated.attemptsLeft;
    } catch (error) {
      throw new ServiceUnavailableException(
        'AUTH_STORE_UNAVAILABLE: Redis unavailable during attempt decrement',
      );
    }
  }

  public async deleteChallenge(
    tenantCode: string,
    userId: string,
    challengeId: string,
  ): Promise<void> {
    try {
      const key = GenerateAuthMfaChallengeKey(tenantCode, userId, challengeId);
      const client = this.redisCacheProvider.getClient();
      if (client) {
        await client.del(key);
      } else {
        await this.redisCacheProvider.del(key);
      }
    } catch (error) {
      // Ignore cache deletion errors
    }
  }
}
