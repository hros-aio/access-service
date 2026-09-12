import crypto from 'crypto';

import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthContext,
  CACHE_KEY_BUILDER,
  CacheService,
  ConfigurationService,
  RedisCacheProvider,
  RequestContextService,
} from '@new-hros/libs-core';
import * as jwt from 'jsonwebtoken';

import { CredentialDomainService } from './credential.domain.service';
import { GenerateAuthMfaChallengeKey } from '../../../constants';
import { UserStatus } from '../../../enums';
import { IpRestrictionService } from '../../ip-restriction/services/ip-restriction.service';
import { LockoutService } from '../../lockout/services/lockout.service';
import { MfaMethodRepository } from '../../mfa/repositories/mfa-method.repository';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettingsRepository } from '../../tenant/repositories/authentication-settings.repository';
import { TenantRepository } from '../../tenant/repositories/tenant.repository';
import { UserRepository } from '../../user/repositories/user.repository';
import { LoginWithFirebaseDto } from '../dto/login-with-firebase.dto';
import { LoginWithPasswordDto } from '../dto/login-with-password.dto';
import { LoginResultResponseDto } from '../dto/result.dto';
import {
  AccountDisabledError,
  AccountLockedError,
  AuthStoreUnavailableError,
  InvalidCredentialsError,
} from '../exceptions/auth.exception';
import { CredentialRepository } from '../repositories/credential.repository';

import { EmployeeReferenceRepository } from '@/modules/employee/repositories/employee-reference.repository';
import { FirebaseSsoApplicationService } from '@/modules/firebase-sso/application/firebase-sso-application.service';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from '@/modules/firebase-sso/domain/exceptions/firebase-sso.exceptions';
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
    private readonly firebaseSsoAppService: FirebaseSsoApplicationService,
    private readonly cacheService: CacheService,
    private readonly employeeRepo: EmployeeReferenceRepository,
  ) {}

  async loginWithPassword(dto: LoginWithPasswordDto): Promise<LoginResultResponseDto> {
    const { email, password, rememberMe } = dto;

    const tenantCodes = await this.userRepository.findTenantCodeByEmail(email);
    let err;
    for (const tenantCode of tenantCodes) {
      try {
        const res = await this.processLogin(tenantCode, email, password, rememberMe);
        return res;
      } catch (error) {
        err = error;
      }
    }

    throw err;
  }

  async loginWithFirebase(dto: LoginWithFirebaseDto): Promise<LoginResultResponseDto> {
    const currentContext = RequestContextService.current();
    const sourceIp = currentContext?.clientMetadata?.ip || 'unknown';
    const userAgent = currentContext?.clientMetadata?.userAgent || 'unknown';

    try {
      const { normalizedEmail: email, tenantCode } = await this.firebaseSsoAppService.authenticate(
        dto.idToken,
        sourceIp,
        userAgent,
      );

      return this.processLogin(tenantCode, email);
    } catch (error) {
      if (
        error instanceof InvalidFirebaseTokenException ||
        error instanceof ExternalIdentityNotMappedException
      ) {
        throw new UnauthorizedException(
          'Authentication failed via Single Sign-On. Please try again or contact your administrator.',
        );
      }
      if (error instanceof AmbiguousIdentityMappingException) {
        throw new ConflictException(
          'Authentication failed due to ambiguous identity mappings. Please contact your administrator.',
        );
      }
      if (error instanceof FirebaseProviderUnavailableException) {
        throw new ServiceUnavailableException(
          'Single Sign-On service is temporarily unavailable. Please try logging in with your password.',
        );
      }
      throw error;
    }
  }

  private async processLogin(
    tenantCode: string,
    email: string,
    password?: string,
    rememberMe?: boolean,
  ): Promise<LoginResultResponseDto> {
    const currentContext = RequestContextService.current();
    const sourceIp = currentContext?.clientMetadata?.ip || 'unknown';
    const userAgent = currentContext?.clientMetadata?.userAgent || 'unknown';

    // Step 0: Validate IP Policy & Fetch Tenant Settings
    const authSettings = await this.validateIpPolicy(tenantCode, email, sourceIp, userAgent);

    // Step 1: Verify tenant existence
    await this.verifyTenantExistence(tenantCode);

    // Step 2 & 3: Fetch and validate user status
    const user = await this.fetchAndValidateUser(tenantCode, email, sourceIp, userAgent);

    // Step 4 & 5: Verify password & handle lockout on failure
    if (password) {
      await this.verifyUserPassword(user, password, email, authSettings, sourceIp, userAgent);
    }

    // Step 5.5: Check MFA requirements and issue challenge if required
    const mfaResult = await this.evaluateMfa(user, authSettings, rememberMe);
    if (mfaResult) {
      return mfaResult;
    }

    // Step 6: Generate Access and Refresh JWT Tokens
    const { sessionId, accessToken, refreshToken } = this.generateAuthTokens(user, rememberMe);

    // Step 7: Store session state and log successful login
    await this.storeSessionAndLogSuccess(user, sessionId, sourceIp, userAgent, rememberMe);

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
  ): Promise<AuthenticationSettings | undefined> {
    const authSettings = await this.authenticationSettingsRepository.findByTenantCode(tenantCode);
    try {
      this.ipRestrictionService.evaluate(sourceIp, authSettings || undefined);
    } catch (err) {
      const user = await this.userRepository.findByEmailUnscoped(email);
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
    return authSettings || undefined;
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
    sourceIp: string,
    userAgent: string,
  ): Promise<User> {
    const user = await this.userRepository.findByEmailWithTenant(email, tenantCode);
    if (!user) {
      await this.preventBruteForceAttack();
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
      await this.preventBruteForceAttack();
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
    email: string,
    authSettings: AuthenticationSettings | undefined,
    sourceIp: string,
    userAgent: string,
  ): Promise<void> {
    const credential = await this.credentialRepository.findActiveByUseUnscope(user.id);

    let isPasswordValid = false;
    if (credential) {
      isPasswordValid = await this.credentialDomainService.verifyPassword(
        credential.passwordHash,
        password,
      );
    }

    if (!isPasswordValid) {
      const locked = await this.lockoutService.handleFailure(
        user.tenantCode,
        user.id,
        authSettings || undefined,
      );
      if (locked) {
        await this.securityEventService.logAccountLocked(
          user.tenantCode,
          user.id,
          sourceIp,
          userAgent,
        );
      }
      await this.securityEventService.logLoginFailed(
        user.tenantCode,
        email,
        sourceIp,
        'INVALID_CREDENTIALS',
        user.id,
        userAgent,
      );
      throw new InvalidCredentialsError();
    }

    await this.lockoutService.resetFailureCount(user.tenantCode, user.id);
  }

  private async evaluateMfa(
    user: User,
    authSettings: AuthenticationSettings | undefined,
    rememberMe?: boolean,
  ): Promise<{ authState: string; challengeId: string } | null> {
    const mfaMethods = await this.mfaMethodRepository.findActiveByUserId(user.id);
    const mfaRequired =
      authSettings?.restrictedMfaEnabled === true ||
      user.mfaEnrollmentRequired === true ||
      user.mfaReEnrollmentRequired === true ||
      mfaMethods.length > 0;

    if (mfaRequired) {
      const challengeId = crypto.randomUUID();
      const challengeKey = GenerateAuthMfaChallengeKey(user.tenantCode, user.id, challengeId);
      const challengeData = {
        challengeId,
        userId: user.id,
        tenantCode: user.tenantCode,
        rememberMe,
        attemptsLeft: 0,
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

  public generateAuthTokens(
    user: User,
    rememberMe?: boolean,
  ): { sessionId: string; accessToken: string; refreshToken: string } {
    const sessionId = crypto.randomUUID();
    const privateKey = this.configService.get<string>('jwt.privateKey');
    if (!privateKey) {
      throw new AuthStoreUnavailableError('JWT Private Key configuration is missing');
    }

    const payload = {
      sub: user.id,
      sid: sessionId,
      tenantCode: user.tenantCode,
      type: 'access',
    };

    const refreshPayload = {
      sub: user.id,
      sid: sessionId,
      tenantCode: user.tenantCode,
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

  public async storeSessionAndLogSuccess(
    user: User,
    sessionId: string,
    sourceIp: string,
    userAgent: string,
    rememberMe?: boolean,
  ): Promise<void> {
    const ttlSeconds = rememberMe ? 2592000 : 604800;
    const sessionKey = CACHE_KEY_BUILDER.buildSession(sessionId);
    const sessionData: AuthContext = {
      sessionId,
      userId: user.id,
      tenantCode: user.tenantCode,
      roles: [],
      scopes: [],
      permissions: [],
    };

    if (user.employeeRefId) {
      const employee = await this.employeeRepo.findById(user.employeeRefId);
      if (employee) {
        sessionData.employee = {
          employeeId: employee.id,
          companyId: employee.companyId,
          locationId: employee.locationId,
          departmentId: employee.departmentId,
          managerId: employee.managerId,
        };
      }
    }

    try {
      await this.cacheService.set(sessionKey, sessionData, ttlSeconds);

      const client = this.redisCacheProvider.getClient();
      if (client) {
        const userSessionsKey = CACHE_KEY_BUILDER.buildUserSessions(user.tenantCode, user.id);
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
      user.tenantCode,
      user.id,
      sessionId,
      sourceIp,
      userAgent,
      rememberMe,
    );
  }

  private async preventBruteForceAttack(): Promise<void> {
    await this.credentialDomainService.verifyPassword(
      '$2b$10$e8p.9p56x8P90Q2m7qX67eO0jU5vK.hZl4u/eZzN7cZ5.0J6.y7iW',
      '12345678@Tc',
    );
  }
}
