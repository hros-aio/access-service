import { BusinessException } from '@new-hros/libs-core';

export class InvalidCredentialsError extends BusinessException {
  constructor(message = 'Invalid email or password.') {
    super(message, 'AUTH_INVALID_CREDENTIALS', 401);
  }
}

export class AccountDisabledError extends BusinessException {
  constructor(message = 'Invalid email or password.') {
    super(message, 'AUTH_ACCOUNT_DISABLED', 401);
  }
}

export class AccountLockedError extends BusinessException {
  constructor(message = 'Invalid email or password.') {
    super(message, 'AUTH_ACCOUNT_LOCKED', 401);
  }
}

export class IpRestrictedError extends BusinessException {
  constructor(message = 'Invalid email or password.') {
    super(message, 'AUTH_IP_RESTRICTED', 401);
  }
}

export class AuthStoreUnavailableError extends BusinessException {
  public readonly cause?: unknown;
  constructor(
    message = 'Service temporarily unavailable. Please try again later.',
    cause?: unknown,
  ) {
    super(message, 'AUTH_SESSION_STORE_UNAVAILABLE', 503);
    this.cause = cause;
  }
}
