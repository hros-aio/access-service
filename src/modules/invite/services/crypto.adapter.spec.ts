import { Test, TestingModule } from '@nestjs/testing';

import { CryptoAdapter } from './crypto.adapter';

describe('CryptoAdapter', () => {
  let adapter: CryptoAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoAdapter],
    }).compile();

    adapter = module.get<CryptoAdapter>(CryptoAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('generateToken', () => {
    it('should generate a 64-character hex raw token and its sha256 hash', () => {
      const result = adapter.generateToken();
      expect(result.rawToken).toHaveLength(64);
      expect(result.tokenHash).toHaveLength(64);

      const expectedHash = adapter.hashToken(result.rawToken);
      expect(result.tokenHash).toBe(expectedHash);
    });

    it('should generate unique tokens', () => {
      const result1 = adapter.generateToken();
      const result2 = adapter.generateToken();
      expect(result1.rawToken).not.toBe(result2.rawToken);
      expect(result1.tokenHash).not.toBe(result2.tokenHash);
    });
  });

  describe('hashToken', () => {
    it('should consistently return the same SHA-256 hash for a given token', () => {
      const token = 'test-token-12345';
      const hash1 = adapter.hashToken(token);
      const hash2 = adapter.hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
