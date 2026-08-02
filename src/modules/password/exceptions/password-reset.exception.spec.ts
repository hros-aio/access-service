import {
  InvalidResetChallengeException,
  InvalidResetCodeException,
  MaxAttemptsExceededException,
  SelfServiceResetDisabledException,
  WeakPasswordException,
} from './password-reset.exception';

describe('PasswordResetExceptions', () => {
  it('should instantiate SelfServiceResetDisabledException with default and custom message', () => {
    const defaultErr = new SelfServiceResetDisabledException();
    expect(defaultErr.message).toContain('Self-service password reset is disabled');
    expect(defaultErr.status).toBe(403);

    const customErr = new SelfServiceResetDisabledException('Custom disabled message');
    expect(customErr.message).toBe('Custom disabled message');
  });

  it('should instantiate InvalidResetCodeException with default and custom message', () => {
    const defaultErr = new InvalidResetCodeException();
    expect(defaultErr.message).toContain('Invalid or expired verification code');
    expect(defaultErr.status).toBe(400);

    const customErr = new InvalidResetCodeException('Custom code error');
    expect(customErr.message).toBe('Custom code error');
  });

  it('should instantiate MaxAttemptsExceededException with default and custom message', () => {
    const defaultErr = new MaxAttemptsExceededException();
    expect(defaultErr.message).toContain('Maximum code verification attempts exceeded');
    expect(defaultErr.status).toBe(429);

    const customErr = new MaxAttemptsExceededException('Custom max attempts error');
    expect(customErr.message).toBe('Custom max attempts error');
  });

  it('should instantiate InvalidResetChallengeException with default and custom message', () => {
    const defaultErr = new InvalidResetChallengeException();
    expect(defaultErr.message).toContain('Reset challenge not found or expired');
    expect(defaultErr.status).toBe(400);

    const customErr = new InvalidResetChallengeException('Custom challenge error');
    expect(customErr.message).toBe('Custom challenge error');
  });

  it('should instantiate WeakPasswordException with default and custom message', () => {
    const defaultErr = new WeakPasswordException();
    expect(defaultErr.message).toContain('Password does not satisfy compliance policy');
    expect(defaultErr.status).toBe(400);

    const customErr = new WeakPasswordException('Custom weak password error');
    expect(customErr.message).toBe('Custom weak password error');
  });
});
