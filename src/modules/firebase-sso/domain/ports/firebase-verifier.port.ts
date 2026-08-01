export interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  tenant_id?: string;
  [key: string]: unknown;
}

export interface FirebaseVerifierPort {
  verifyIdToken(idToken: string): Promise<DecodedFirebaseToken>;
}

export const FIREBASE_VERIFIER_PORT = Symbol('FirebaseVerifierPort');
