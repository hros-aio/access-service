import { BusinessException } from '@new-hros/libs-core';

export class SelfServiceResetDisabledException extends BusinessException {
  constructor(message = 'Self-service password reset is disabled by tenant policy.') {
    super(message, 'SELF_SERVICE_RESET_DISABLED', 403);
  }
}

export class InvalidResetCodeException extends BusinessException {
  constructor(message = 'Invalid or expired verification code.') {
    super(message, 'INVALID_RESET_CODE', 400);
  }
}

export class MaxAttemptsExceededException extends BusinessException {
  constructor(message = 'Maximum code verification attempts exceeded.') {
    super(message, 'MAX_ATTEMPTS_EXCEEDED', 429);
  }
}

export class InvalidResetChallengeException extends BusinessException {
  constructor(message = 'Reset challenge not found or expired.') {
    super(message, 'RESET_CHALLENGE_EXPIRED', 400);
  }
}

export class WeakPasswordException extends BusinessException {
  constructor(message = 'Password does not satisfy compliance policy.') {
    super(message, 'WEAK_PASSWORD', 400);
  }
}
