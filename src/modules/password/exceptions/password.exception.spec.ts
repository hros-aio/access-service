import {
  AuthSessionExpiredError,
  AuthStoreUnavailableError,
  ConcurrentModificationError,
  CredentialAlreadyExistsError,
  InvalidPasswordPolicyError,
} from './password.exception';

describe('PasswordExceptions', () => {
  it('should instantiate AuthSessionExpiredError with default and custom message', () => {
    const defaultErr = new AuthSessionExpiredError();
    expect(defaultErr.message).toContain('Setup session has expired');
    expect(defaultErr.status).toBe(401);

    const customErr = new AuthSessionExpiredError('Custom error');
    expect(customErr.message).toBe('Custom error');
  });

  it('should instantiate InvalidPasswordPolicyError with default and custom message', () => {
    const defaultErr = new InvalidPasswordPolicyError();
    expect(defaultErr.message).toContain('Password does not meet tenant security requirements');
    expect(defaultErr.status).toBe(400);

    const customErr = new InvalidPasswordPolicyError('Custom policy error');
    expect(customErr.message).toBe('Custom policy error');
  });

  it('should instantiate CredentialAlreadyExistsError with default and custom message', () => {
    const defaultErr = new CredentialAlreadyExistsError();
    expect(defaultErr.message).toContain('User already has an active password configured');
    expect(defaultErr.status).toBe(409);

    const customErr = new CredentialAlreadyExistsError('Custom exists error');
    expect(customErr.message).toBe('Custom exists error');
  });

  it('should instantiate AuthStoreUnavailableError with default and custom message', () => {
    const defaultErr = new AuthStoreUnavailableError();
    expect(defaultErr.message).toContain('Service temporarily unavailable');
    expect(defaultErr.status).toBe(503);

    const customErr = new AuthStoreUnavailableError('Custom store error');
    expect(customErr.message).toBe('Custom store error');
  });

  it('should instantiate ConcurrentModificationError with default and custom message', () => {
    const defaultErr = new ConcurrentModificationError();
    expect(defaultErr.message).toContain('Request conflicts with a concurrent update');
    expect(defaultErr.status).toBe(409);

    const customErr = new ConcurrentModificationError('Custom concurrent error');
    expect(customErr.message).toBe('Custom concurrent error');
  });
});
