import { BusinessException } from '@new-hros/libs-core';

export class AuthSessionExpiredError extends BusinessException {
  constructor(message = 'Setup session has expired. Please log in via SSO again.') {
    super(message, 'AUTH_SESSION_EXPIRED', 401);
  }
}

export class InvalidPasswordPolicyError extends BusinessException {
  constructor(message = 'Password does not meet tenant security requirements.') {
    super(message, 'INVALID_PASSWORD_POLICY', 400);
  }
}

export class CredentialAlreadyExistsError extends BusinessException {
  constructor(message = 'User already has an active password configured.') {
    super(message, 'CREDENTIAL_ALREADY_EXISTS', 409);
  }
}

export class AuthStoreUnavailableError extends BusinessException {
  constructor(message = 'Service temporarily unavailable. Please try again later.') {
    super(message, 'AUTH_SESSION_STORE_UNAVAILABLE', 503);
  }
}

export class ConcurrentModificationError extends BusinessException {
  constructor(message = 'Request conflicts with a concurrent update. Please retry.') {
    super(message, 'CONCURRENT_MODIFICATION', 409);
  }
}
