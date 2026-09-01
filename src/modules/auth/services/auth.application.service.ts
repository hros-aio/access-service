import crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import {
  ConfigurationService,
  RedisCacheProvider,
  RequestContextService,
} from '@new-hros/libs-core';
import * as jwt from 'jsonwebtoken';

import { CredentialDomainService } from './credential.domain.service';
import { GenerateSessionKey, GenerateUserSessionsKey } from '../../../constants';
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

import { AuthenticationSettings } from '@/modules/tenant/entities/authentication-settings.entity';
import { User } from '@/modules/user/entities/user.entity';

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
    const currentContext = RequestContextService.current();
    const sourceIp = currentContext?.clientMetadata?.ip || 'unknown';
    const userAgent = currentContext?.clientMetadata?.userAgent || 'unknown';

    // Step 0: Validate IP Policy & Fetch Tenant Settings
    const authSettings = await this.validateIpPolicy(tenantCode, email, sourceIp, userAgent);

    // Step 1: Verify tenant existence
    await this.verifyTenantExistence(tenantCode);

    // Step 2 & 3: Fetch and validate user status
    const user = await this.fetchAndValidateUser(tenantCode, email, password, sourceIp, userAgent);

    // Step 4 & 5: Verify password & handle lockout on failure
    await this.verifyUserPassword(
      user,
      password,
      tenantCode,
      email,
      authSettings,
      sourceIp,
      userAgent,
    );

    // Step 5.5: Check MFA requirements and issue challenge if required
    const mfaResult = await this.evaluateMfa(user, tenantCode, authSettings, rememberMe ?? false);
    if (mfaResult) {
      return mfaResult;
    }

    // Step 6: Generate Access and Refresh JWT Tokens
    const { sessionId, accessToken, refreshToken } = this.generateAuthTokens(
      user,
      tenantCode,
      rememberMe ?? false,
    );

    // Step 7: Store session state and log successful login
    await this.storeSessionAndLogSuccess(
      user,
      tenantCode,
      sessionId,
      rememberMe ?? false,
      sourceIp,
      userAgent,
    );

    return {
      authState: 'AUTHENTICATED',
      accessToken,
      refreshToken,
    };
  }

  private async validateIpPolicy(
    tenantCode: string,
    email: string,
    sourceIp: string,
    userAgent: string,
  ): Promise<AuthenticationSettings | null> {
    const authSettings = await this.authenticationSettingsRepository.findByTenantCode(tenantCode);
    try {
      this.ipRestrictionService.evaluate(sourceIp, authSettings || undefined);
    } catch (err) {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.userRepository.findOne({ tenantCode, normalizedEmail });
      if (user) {
        await this.lockoutService.recordIpFailure(tenantCode, user.id, sourceIp);
      }
      await this.securityEventService.logLoginFailed(
        tenantCode,
        email,
        sourceIp,
        'IP_RESTRICTION_DENIED',
        user?.id,
        userAgent,
      );
      throw err;
    }
    return authSettings;
  }

  private async verifyTenantExistence(tenantCode: string): Promise<void> {
    const tenantExists = await this.tenantRepository.exists(tenantCode);
    if (!tenantExists) {
      throw new InvalidCredentialsError();
    }
  }

  private async fetchAndValidateUser(
    tenantCode: string,
    email: string,
    password: string,
    sourceIp: string,
    userAgent: string,
  ): Promise<User> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepository.findOne({ tenantCode, normalizedEmail });

    if (!user) {
      await this.credentialDomainService.verifyPassword(
        '$2b$10$e8p.9p56x8P90Q2m7qX67eO0jU5vK.hZl4u/eZzN7cZ5.0J6.y7iW',
        password,
      );
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

    if (user.status !== UserStatus.ACTIVE) {
      await this.credentialDomainService.verifyPassword(
        '$2b$10$e8p.9p56x8P90Q2m7qX67eO0jU5vK.hZl4u/eZzN7cZ5.0J6.y7iW',
        password,
      );
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
      } else if (user.status === UserStatus.LOCKED) {
        await this.securityEventService.logLoginFailed(
          tenantCode,
          email,
          sourceIp,
          'ACCOUNT_LOCKED',
          user.id,
          userAgent,
        );
        throw new AccountLockedError();
      } else {
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
    }

    return user;
  }

  private async verifyUserPassword(
    user: User,
    password: string,
    tenantCode: string,
    email: string,
    authSettings: AuthenticationSettings | null,
    sourceIp: string,
    userAgent: string,
  ): Promise<void> {
    const credential = await this.credentialRepository.findActiveByUserId(user.id);

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

    await this.lockoutService.resetFailureCount(tenantCode, user.id);
  }

  private async evaluateMfa(
    user: User,
    tenantCode: string,
    authSettings: AuthenticationSettings | null,
    rememberMe: boolean,
  ): Promise<{ authState: string; challengeId: string } | null> {
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
        rememberMe,
        createdAt: new Date().toISOString(),
      };

      try {
        await this.redisCacheProvider.set(challengeKey, challengeData, 300);
      } catch (err) {
        throw new AuthStoreUnavailableError(
          'Service temporarily unavailable. Please try again later.',
          err,
        );
      }

      return {
        authState: 'MFA_REQUIRED',
        challengeId,
      };
    }

    return null;
  }

  private generateAuthTokens(
    user: User,
    tenantCode: string,
    rememberMe: boolean,
  ): { sessionId: string; accessToken: string; refreshToken: string } {
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

    const refreshPayload = {
      sub: user.id,
      sid: sessionId,
      tenantCode,
      type: 'refresh',
    };

    try {
      const accessToken = jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        expiresIn: '2h',
      });

      const refreshToken = jwt.sign(refreshPayload, privateKey, {
        algorithm: 'RS256',
        expiresIn: rememberMe ? '30d' : '7d',
      });

      return { sessionId, accessToken, refreshToken };
    } catch (jwtErr) {
      throw new AuthStoreUnavailableError(
        'Service temporarily unavailable. Please try again later.',
        jwtErr,
      );
    }
  }

  private async storeSessionAndLogSuccess(
    user: User,
    tenantCode: string,
    sessionId: string,
    rememberMe: boolean,
    sourceIp: string,
    userAgent: string,
  ): Promise<void> {
    const ttlSeconds = rememberMe ? 2592000 : 604800;
    const sessionKey = GenerateSessionKey(sessionId);
    const sessionData = {
      sessionId,
      userId: user.id,
      tenantCode,
      user: {
        id: user.id,
        tenantCode,
        email: user.displayEmail,
        roles: [],
      },
      createdAt: new Date().toISOString(),
    };

    try {
      await this.redisCacheProvider.set(sessionKey, sessionData, ttlSeconds);

      const client = this.redisCacheProvider.getClient();
      if (client) {
        const userSessionsKey = GenerateUserSessionsKey(tenantCode, user.id);
        await client.sadd(userSessionsKey, sessionId);
        await client.expire(userSessionsKey, ttlSeconds);
      }
    } catch (err) {
      throw new AuthStoreUnavailableError(
        'Service temporarily unavailable. Please try again later.',
        err,
      );
    }

    await this.securityEventService.logLoginSucceeded(
      tenantCode,
      user.id,
      sessionId,
      sourceIp,
      userAgent,
      rememberMe,
    );
  }
}
