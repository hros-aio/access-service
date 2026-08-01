export class InvalidFirebaseTokenException extends Error {
  constructor(message = 'Invalid or expired Firebase ID token.') {
    super(message);
    this.name = 'InvalidFirebaseTokenException';
  }
}

export class FirebaseProviderUnavailableException extends Error {
  constructor(
    message = 'Single Sign-On service is temporarily unavailable. Please try logging in with your password.',
  ) {
    super(message);
    this.name = 'FirebaseProviderUnavailableException';
  }
}

export class ExternalIdentityNotMappedException extends Error {
  constructor(message = 'No internal user account found for the provided external identity.') {
    super(message);
    this.name = 'ExternalIdentityNotMappedException';
  }
}

export class AmbiguousIdentityMappingException extends Error {
  constructor(message = 'External identity maps to multiple internal user accounts.') {
    super(message);
    this.name = 'AmbiguousIdentityMappingException';
  }
}
