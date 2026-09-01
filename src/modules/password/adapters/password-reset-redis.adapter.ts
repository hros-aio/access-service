import { Injectable } from '@nestjs/common';
import { RedisCacheProvider } from '@new-hros/libs-core';

export interface PasswordResetChallengeData {
  tenantCode: string;
  userId: string;
  hashedCode: string;
  codeVerified: boolean;
  resetToken?: string;
  attempts: number;
}

@Injectable()
export class PasswordResetRedisAdapter {
  private readonly ttlSeconds = 900; // 15 minutes

  constructor(private readonly redisCacheProvider: RedisCacheProvider) {}

  private getKey(challengeId: string, tenantCode: string, userId: string): string {
    return `auth:password-reset:{${tenantCode}:${userId}}:${challengeId}`;
  }

  async saveChallenge(
    challengeId: string,
    data: Omit<PasswordResetChallengeData, 'attempts'>,
  ): Promise<void> {
    const key = this.getKey(challengeId, data.tenantCode, data.userId);
    const challengeObj: PasswordResetChallengeData = {
      ...data,
      attempts: 0,
    };
    await this.redisCacheProvider.set(key, JSON.stringify(challengeObj), this.ttlSeconds);
  }

  async getChallenge(
    challengeId: string,
    tenantCode: string,
    userId: string,
  ): Promise<PasswordResetChallengeData | null> {
    const key = this.getKey(challengeId, tenantCode, userId);
    const raw = await this.redisCacheProvider.get<string>(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async incrementAttempts(
    challengeId: string,
    tenantCode: string,
    userId: string,
  ): Promise<number> {
    const challenge = await this.getChallenge(challengeId, tenantCode, userId);
    if (!challenge) return 0;

    challenge.attempts += 1;
    const key = this.getKey(challengeId, tenantCode, userId);
    await this.redisCacheProvider.set(key, JSON.stringify(challenge), this.ttlSeconds);
    return challenge.attempts;
  }

  async markCodeVerified(
    challengeId: string,
    tenantCode: string,
    userId: string,
    resetToken: string,
  ): Promise<void> {
    const challenge = await this.getChallenge(challengeId, tenantCode, userId);
    if (!challenge) return;

    challenge.codeVerified = true;
    challenge.resetToken = resetToken;
    const key = this.getKey(challengeId, tenantCode, userId);
    await this.redisCacheProvider.set(key, JSON.stringify(challenge), this.ttlSeconds);
  }

  async deleteChallenge(challengeId: string, tenantCode: string, userId: string): Promise<void> {
    const key = this.getKey(challengeId, tenantCode, userId);
    const client = this.redisCacheProvider.getClient();
    if (client) {
      await client.del(key);
    } else {
      await this.redisCacheProvider.del(key);
    }
  }
}
