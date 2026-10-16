import { Injectable, Logger } from '@nestjs/common';
import {
  CognitoException,
  CognitoInternalException,
  CognitoService,
  CognitoUserAlreadyExistsException,
  CreateUserInput,
} from '@new-hros/libs-aws';

import { CognitoProvisioningException } from '../domain/exceptions/cognito-provisioning.exception';
import {
  CognitoProvisioningResult,
  ProvisionCognitoUserInput,
} from '../interfaces/cognito-provisioning.interface';
import { UserRepository } from '../repositories/user.repository';

import { SecurityEventService } from '@/modules/security-event/services/security-event.service';

@Injectable()
export class CognitoUserProvisioningService {
  private readonly logger = new Logger(CognitoUserProvisioningService.name);
  private readonly maxRetries = 3;
  private readonly initialBackoffMs = 50;

  constructor(
    private readonly cognitoService: CognitoService,
    private readonly userRepository: UserRepository,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async provisionCognitoUser(input: ProvisionCognitoUserInput): Promise<CognitoProvisioningResult> {
    const normalizedEmail = input.email.toLowerCase().trim();
    let retryCount = 0;

    try {
      const isVerified = input.isEmailVerified === true;
      const createInput: CreateUserInput = {
        username: normalizedEmail,
        userAttributes: {
          email: normalizedEmail,
          email_verified: isVerified ? 'true' : 'false',
          'custom:tenant_code': input.tenantCode,
        },
        messageAction: input.suppressNotification ? 'SUPPRESS' : undefined,
      };

      const cognitoRecord = await this.executeWithRetry(
        () => this.cognitoService.createUser(createInput),
        (attempts) => (retryCount = attempts),
      );

      const sub = cognitoRecord.attributes?.sub;
      if (!sub) {
        throw new CognitoProvisioningException(
          'Cognito user record is missing required sub attribute',
          'MISSING_COGNITO_SUB',
        );
      }

      await this.userRepository.update(input.userId, {
        externalIdentityId: sub,
      });

      await this.securityEventService.logCognitoUserProvisioned(
        input.tenantCode,
        input.userId,
        normalizedEmail,
        sub,
        'CREATED',
      );

      this.logger.log(`Provisioned Cognito user for ${normalizedEmail} (sub: ${sub})`);

      return {
        userId: input.userId,
        externalIdentityId: sub,
        username: normalizedEmail,
        action: 'CREATED',
      };
    } catch (error) {
      if (error instanceof CognitoUserAlreadyExistsException) {
        this.logger.warn(
          `Cognito user already exists for ${normalizedEmail}. Linking existing identity.`,
        );
        return this.linkExistingCognitoUser(input, normalizedEmail);
      }

      const errorCode =
        error instanceof CognitoProvisioningException
          ? (error.errorCode ?? 'COGNITO_PROVISIONING_ERROR')
          : error instanceof CognitoException
            ? error.code
            : ((error as { name?: string })?.name ?? 'UNKNOWN_ERROR');
      const errorMessage = (error as Error)?.message ?? 'Failed to provision Cognito user';

      await this.securityEventService.logCognitoProvisioningFailed(
        input.tenantCode,
        input.userId,
        normalizedEmail,
        errorCode,
        errorMessage,
        retryCount,
      );

      this.logger.error(
        `Failed to provision Cognito user for ${normalizedEmail}: ${errorMessage}`,
        (error as Error)?.stack,
      );

      if (error instanceof CognitoProvisioningException) {
        throw error;
      }

      throw new CognitoProvisioningException(errorMessage, errorCode, error);
    }
  }

  private async linkExistingCognitoUser(
    input: ProvisionCognitoUserInput,
    normalizedEmail: string,
  ): Promise<CognitoProvisioningResult> {
    try {
      const existingUser = await this.executeWithRetry(() =>
        this.cognitoService.getUser(normalizedEmail),
      );

      const sub = existingUser.attributes?.sub;
      if (!sub) {
        throw new CognitoProvisioningException(
          'Existing Cognito user record is missing required sub attribute',
          'MISSING_COGNITO_SUB',
        );
      }

      const cognitoTenant = existingUser.attributes?.['custom:tenant_code'];
      if (cognitoTenant && cognitoTenant !== input.tenantCode) {
        throw new CognitoProvisioningException(
          `Cognito user exists but belongs to a different tenant: ${cognitoTenant}`,
          'TENANT_MISMATCH',
        );
      }

      const existingInternalUser = await this.userRepository.findByTenantAndExternalIdentity(sub);
      if (existingInternalUser && existingInternalUser.id !== input.userId) {
        throw new CognitoProvisioningException(
          `Cognito sub ${sub} is already linked to another internal user ${existingInternalUser.id}`,
          'IDENTITY_CONFLICT',
        );
      }

      await this.userRepository.update(input.userId, {
        externalIdentityId: sub,
      });

      await this.securityEventService.logCognitoUserProvisioned(
        input.tenantCode,
        input.userId,
        normalizedEmail,
        sub,
        'LINKED_EXISTING',
      );

      return {
        userId: input.userId,
        externalIdentityId: sub,
        username: normalizedEmail,
        action: 'LINKED_EXISTING',
      };
    } catch (linkError) {
      const errorCode =
        linkError instanceof CognitoProvisioningException
          ? (linkError.errorCode ?? 'LINK_CONFLICT')
          : linkError instanceof CognitoException
            ? linkError.code
            : ((linkError as { name?: string })?.name ?? 'FETCH_EXISTING_FAILED');
      const errorMessage =
        (linkError as Error)?.message ??
        `Failed to fetch existing Cognito user for linking: ${normalizedEmail}`;

      await this.securityEventService.logCognitoProvisioningFailed(
        input.tenantCode,
        input.userId,
        normalizedEmail,
        errorCode,
        errorMessage,
        1,
      );

      if (linkError instanceof CognitoProvisioningException) {
        throw linkError;
      }

      throw new CognitoProvisioningException(errorMessage, errorCode, linkError);
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    onAttemptCount?: (count: number) => void,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (onAttemptCount) {
        onAttemptCount(attempt);
      }
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (error instanceof CognitoUserAlreadyExistsException) {
          // Non-retryable conflict: immediately bubble up
          throw error;
        }

        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === this.maxRetries) {
          throw error;
        }

        const delayMs = this.initialBackoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof CognitoInternalException) {
      return true;
    }
    const errorName = (error as { name?: string })?.name || '';
    const message = (error as { message?: string })?.message || '';

    return (
      errorName.includes('Throttling') ||
      errorName.includes('TooManyRequests') ||
      errorName.includes('Internal') ||
      errorName.includes('Timeout') ||
      message.includes('timeout') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNRESET')
    );
  }
}
