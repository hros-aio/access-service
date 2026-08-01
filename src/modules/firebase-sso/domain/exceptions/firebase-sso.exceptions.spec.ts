import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from './firebase-sso.exceptions';

describe('Firebase SSO Domain Exceptions', () => {
  it('should instantiate with default messages', () => {
    const invalidToken = new InvalidFirebaseTokenException();
    const providerUnavailable = new FirebaseProviderUnavailableException();
    const notMapped = new ExternalIdentityNotMappedException();
    const ambiguous = new AmbiguousIdentityMappingException();

    expect(invalidToken.name).toBe('InvalidFirebaseTokenException');
    expect(providerUnavailable.name).toBe('FirebaseProviderUnavailableException');
    expect(notMapped.name).toBe('ExternalIdentityNotMappedException');
    expect(ambiguous.name).toBe('AmbiguousIdentityMappingException');
  });
});
