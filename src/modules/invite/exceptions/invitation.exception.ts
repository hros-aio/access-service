import { BusinessException } from '@new-hros/libs-core';

export class AuthInvitationInvalidError extends BusinessException {
  constructor(message = 'Invitation link is invalid, revoked, or has expired') {
    super(message, 'AUTH_INVITATION_INVALID', 400);
  }
}

export class InvitationNotAllowedError extends BusinessException {
  constructor(message = 'Cannot resend invitation: user already has an active credential') {
    super(message, 'INVITATION_NOT_ALLOWED', 409);
  }
}

export class CrossTenantAccessDeniedError extends BusinessException {
  constructor(message = 'Resource not found') {
    super(message, 'RESOURCE_NOT_FOUND', 404);
  }
}

export class InvalidPasswordPolicyError extends BusinessException {
  constructor(message = 'Password does not meet validation criteria') {
    super(message, 'INVALID_PASSWORD_POLICY', 400);
  }
}

export class ConcurrentModificationError extends BusinessException {
  constructor(message = 'Concurrent update conflict') {
    super(message, 'CONCURRENT_MODIFICATION', 409);
  }
}

export class AuthSessionStoreUnavailableError extends BusinessException {
  constructor(message = 'Authentication session store is temporarily unavailable') {
    super(message, 'AUTH_SESSION_STORE_UNAVAILABLE', 503);
  }
}
