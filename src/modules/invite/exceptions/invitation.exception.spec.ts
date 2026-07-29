import {
  AuthInvitationInvalidError,
  InvitationNotAllowedError,
  CrossTenantAccessDeniedError,
  InvalidPasswordPolicyError,
  ConcurrentModificationError,
  AuthSessionStoreUnavailableError,
} from './invitation.exception';

describe('Invitation Exceptions', () => {
  it('should instantiate all exceptions with correct properties', () => {
    const err1 = new AuthInvitationInvalidError();
    expect(err1.message).toBe('Invitation link is invalid, revoked, or has expired');
    expect(err1.code).toBe('AUTH_INVITATION_INVALID');
    expect(err1.status).toBe(400);

    const err2 = new InvitationNotAllowedError();
    expect(err2.message).toBe('Cannot resend invitation: user already has an active credential');
    expect(err2.code).toBe('INVITATION_NOT_ALLOWED');
    expect(err2.status).toBe(409);

    const err3 = new CrossTenantAccessDeniedError();
    expect(err3.message).toBe('Resource not found');
    expect(err3.code).toBe('RESOURCE_NOT_FOUND');
    expect(err3.status).toBe(404);

    const err4 = new InvalidPasswordPolicyError();
    expect(err4.message).toBe('Password does not meet validation criteria');
    expect(err4.code).toBe('INVALID_PASSWORD_POLICY');
    expect(err4.status).toBe(400);

    const err5 = new ConcurrentModificationError();
    expect(err5.message).toBe('Concurrent update conflict');
    expect(err5.code).toBe('CONCURRENT_MODIFICATION');
    expect(err5.status).toBe(409);

    const err6 = new AuthSessionStoreUnavailableError();
    expect(err6.message).toBe('Authentication session store is temporarily unavailable');
    expect(err6.code).toBe('AUTH_SESSION_STORE_UNAVAILABLE');
    expect(err6.status).toBe(503);
  });
});
