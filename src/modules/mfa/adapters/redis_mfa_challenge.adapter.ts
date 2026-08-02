import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

export interface MfaChallengeData {
  challengeId: string;
  tenantCode: string;
  userId: string;
  factorType: string;
  codeHash: string;
  attemptsLeft: number;
}

@Injectable()
export class RedisMfaChallengeAdapter {
  private readonly defaultTtl = 300; // 5 minutes

  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  private getKey(tenantCode: string, userId: string, challengeId: string): string {
    return `auth:mfa-challenge:${tenantCode}:${userId}:${challengeId}`;
  }

  public async saveChallenge(data: MfaChallengeData): Promise<void> {
    try {
      const key = this.getKey(data.tenantCode, data.userId, data.challengeId);
      await this.redisCacheProvider.set(key, JSON.stringify(data), this.defaultTtl);
    } catch (error) {
      throw new ServiceUnavailableException(
        'AUTH_STORE_UNAVAILABLE: Failed to store MFA challenge in Redis',
      );
    }
  }

  public async getChallenge(
    tenantCode: string,
    userId: string,
    challengeId: string,
  ): Promise<MfaChallengeData | null> {
    try {
      const key = this.getKey(tenantCode, userId, challengeId);
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
      const key = this.getKey(data.tenantCode, data.userId, data.challengeId);
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
      const key = this.getKey(tenantCode, userId, challengeId);
      const provider = this.redisCacheProvider as unknown as {
        getClient?(): { del(key: string): Promise<number> } | null;
        del?(key: string): Promise<number>;
      };
      const client = provider.getClient?.();
      if (client) {
        await client.del(key);
      } else if (provider.del) {
        await provider.del(key);
      }
    } catch (error) {
      // Ignore cache deletion errors
    }
  }
}
