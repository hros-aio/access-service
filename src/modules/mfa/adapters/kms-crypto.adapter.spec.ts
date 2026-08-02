import { KmsCryptoAdapter } from './kms-crypto.adapter';

describe('KmsCryptoAdapter', () => {
  let adapter: KmsCryptoAdapter;

  beforeEach(() => {
    adapter = new KmsCryptoAdapter();
  });

  it('should encrypt and decrypt a plaintext string correctly', async () => {
    const plaintext = 'super-secret-mfa-seed';
    const encrypted = await adapter.encrypt(plaintext);

    expect(encrypted).toBeDefined();
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = await adapter.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw an error for invalid ciphertext format', async () => {
    await expect(adapter.decrypt('invalid-ciphertext')).rejects.toThrow(
      'Invalid ciphertext format',
    );
  });
});
