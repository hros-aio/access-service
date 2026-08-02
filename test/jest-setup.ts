import crypto from 'crypto';

// Always generate a valid key pair for test signing/verification to override mock environment settings
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;

process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'hrms_access_db_test';

jest.setTimeout(30000);
