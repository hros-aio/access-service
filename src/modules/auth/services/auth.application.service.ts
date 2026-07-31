import crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import {
  ConfigurationService,
  RedisCacheProvider,
  RequestContextService,
} from '@new-hros/libs-core';
import * as jwt from 'jsonwebtoken';

import { CredentialDomainService } from './credential.domain.service';
import { UserStatus } from '../../../enums';
import { IpRestrictionService } from '../../ip-restriction/services/ip-restriction.service';
import { LockoutService } from '../../lockout/services/lockout.service';
import { MfaMethodRepository } from '../../mfa/repositories/mfa-method.repository';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettingsRepository } from '../../tenant/repositories/authentication-settings.repository';
import { TenantRepository } from '../../tenant/repositories/tenant.repository';
import { UserRepository } from '../../user/repositories/user.repository';
import { LoginWithPasswordDto } from '../dto/login-with-password.dto';
import {
  AccountDisabledError,
  AccountLockedError,
  AuthStoreUnavailableError,
  InvalidCredentialsError,
} from '../exceptions/auth.exception';
import { CredentialRepository } from '../repositories/credential.repository';

@Injectable()
export class AuthApplicationService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialDomainService: CredentialDomainService,
    private readonly tenantRepository: TenantRepository,
    private readonly redisCacheProvider: RedisCacheProvider,
    private readonly configService: ConfigurationService,
    private readonly authenticationSettingsRepository: AuthenticationSettingsRepository,
    private readonly mfaMethodRepository: MfaMethodRepository,
    private readonly ipRestrictionService: IpRestrictionService,
    private readonly lockoutService: LockoutService,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async loginWithPassword(dto: LoginWithPasswordDto): Promise<{
    authState: string;
    accessToken?: string;
    refreshToken?: string;
    challengeId?: string;
  }> {
    const { tenantCode, email, password, rememberMe } = dto;

    // Load RequestContext details
    const currentContext = RequestContextService.current();
    const sourceIp = currentContext?.clientMetadata?.ip || 'unknown';
    const userAgent = currentContext?.clientMetadata?.userAgent || 'unknown';

    // 0. Fetch Tenant Settings & Evaluate IP Restriction Policy
    const authSettings = await this.authenticationSettingsRepository.findByTenantCode(tenantCode);
    try {
      this.ipRestrictionService.evaluate(sourceIp, authSettings || undefined);
    } catch (err) {
      await this.securityEventService.logLoginFailed(
        tenantCode,
        email,
        sourceIp,
        'IP_RESTRICTION_DENIED',
        undefined,
        userAgent,
      );
      throw err;
    }

    // 1. Verify tenant exists and is active
    const tenantExists = await this.tenantRepository.exists(tenantCode);
    if (!tenantExists) {
      throw new InvalidCredentialsError();
    }

    // 2. Fetch user scoped by tenant and email
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepository.findOne({ tenantCode, normalizedEmail });
    if (!user) {
      await this.securityEventService.logLoginFailed(
        tenantCode,
        email,
        sourceIp,
        'INVALID_CREDENTIALS',
        undefined,
        userAgent,
      );
      throw new InvalidCredentialsError();
    }

    // 3. Verify user status
    if (user.status === UserStatus.SUSPENDED) {
      await this.securityEventService.logLoginFailed(
        tenantCode,
        email,
        sourceIp,
        'ACCOUNT_DISABLED',
        user.id,
        userAgent,
      );
      throw new AccountDisabledError();
    }
    if (user.status === UserStatus.LOCKED) {
      await this.securityEventService.logLoginFailed(
        tenantCode,
        email,
        sourceIp,
        'ACCOUNT_LOCKED',
        user.id,
        userAgent,
      );
      throw new AccountLockedError();
    }

    // 4. Fetch active password credential
    const credential = await this.credentialRepository.findActiveByUserId(user.id);

    // 5. Verify plaintext password against hash
    let isPasswordValid = false;
    if (credential) {
      isPasswordValid = await this.credentialDomainService.verifyPassword(
        credential.passwordHash,
        password,
      );
    }

    if (!isPasswordValid) {
      const locked = await this.lockoutService.handleFailure(
        tenantCode,
        user.id,
        authSettings || undefined,
      );
      if (locked) {
        await this.securityEventService.logAccountLocked(tenantCode, user.id, sourceIp, userAgent);
      }
      await this.securityEventService.logLoginFailed(
        tenantCode,
        email,
        sourceIp,
        'INVALID_CREDENTIALS',
        user.id,
        userAgent,
      );
      throw new InvalidCredentialsError();
    }

    // Reset lockout failure count on successful authentication
    await this.lockoutService.resetFailureCount(tenantCode, user.id);

    // 5.5 Check if MFA is required or enrolled
    const mfaMethods = await this.mfaMethodRepository.findActiveByUserId(user.id);
    const mfaRequired =
      authSettings?.restrictedMfaEnabled === true ||
      user.mfaEnrollmentRequired === true ||
      user.mfaReenrollmentRequired === true ||
      mfaMethods.length > 0;

    if (mfaRequired) {
      const challengeId = crypto.randomUUID();
      const challengeKey = `auth:mfa-challenge:${challengeId}`;
      const challengeData = {
        challengeId,
        userId: user.id,
        tenantCode,
        rememberMe: rememberMe ?? false,
        createdAt: new Date().toISOString(),
      };

      try {
        await this.redisCacheProvider.set(challengeKey, challengeData, 300); // 5 minutes TTL
      } catch (err) {
        throw new AuthStoreUnavailableError();
      }

      return {
        authState: 'MFA_REQUIRED',
        challengeId,
      };
    }

    // 6. Generate session ID and sign JWT tokens
    const sessionId = crypto.randomUUID();
    const privateKey = this.configService.get<string>('jwt.privateKey');
    if (!privateKey) {
      throw new AuthStoreUnavailableError('JWT Private Key configuration is missing');
    }

    const payload = {
      sub: user.id,
      sid: sessionId,
      tenantCode,
      type: 'access',
    };

    const accessToken = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      expiresIn: '2h',
    });

    const refreshPayload = {
      sub: user.id,
      sid: sessionId,
      tenantCode,
      type: 'refresh',
    };

    const refreshToken = jwt.sign(refreshPayload, privateKey, {
      algorithm: 'RS256',
      expiresIn: rememberMe ? '30d' : '7d',
    });

    // 7. Store session in Redis
    const ttlSeconds = rememberMe ? 2592000 : 900; // 30 days or 15 minutes
    const sessionKey = `auth:session:${sessionId}`;
    const sessionData = {
      sessionId,
      userId: user.id,
      tenantCode,
      user: {
        id: user.id,
        tenantCode,
        email: user.displayEmail,
        roles: [], // empty roles array by default
      },
      createdAt: new Date().toISOString(),
    };

    try {
      await this.redisCacheProvider.set(sessionKey, sessionData, ttlSeconds);

      // Track active user session
      const client = (
        this.redisCacheProvider as unknown as {
          client: {
            sadd(k: string, v: string): Promise<number>;
            expire(k: string, t: number): Promise<number>;
          };
        }
      ).client;
      if (client) {
        const userSessionsKey = `auth:user-sessions:${tenantCode}:${user.id}`;
        await client.sadd(userSessionsKey, sessionId);
        await client.expire(userSessionsKey, ttlSeconds);
      }

      // Log successful login security event
      await this.securityEventService.logLoginSucceeded(
        tenantCode,
        user.id,
        sessionId,
        sourceIp,
        userAgent,
      );
    } catch (err) {
      throw new AuthStoreUnavailableError();
    }

    return {
      authState: 'AUTHENTICATED',
      accessToken,
      refreshToken,
    };
  }
}
