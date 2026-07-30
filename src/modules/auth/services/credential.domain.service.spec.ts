import { Test, TestingModule } from '@nestjs/testing';

import { CredentialDomainService } from './credential.domain.service';

describe('CredentialDomainService', () => {
  let service: CredentialDomainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CredentialDomainService],
    }).compile();

    service = module.get<CredentialDomainService>(CredentialDomainService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPassword', () => {
    it('should generate a hashed password and contain argon2id signature', async () => {
      const password = 'MySecurePassword123!';
      const result = await service.hashPassword(password);
      expect(result.hash).toBeDefined();
      expect(result.hash).not.toBe(password);
      expect(result.hash).toContain('$argon2id$');
      expect(result.algorithm).toBe('argon2id');
    });
  });

  describe('verifyPassword', () => {
    it('should return true for a matching password', async () => {
      const password = 'MySecurePassword123!';
      const { hash } = await service.hashPassword(password);
      const isMatch = await service.verifyPassword(hash, password);
      expect(isMatch).toBe(true);
    });

    it('should return false for a non-matching password', async () => {
      const password = 'MySecurePassword123!';
      const wrongPassword = 'WrongPassword123!';
      const { hash } = await service.hashPassword(password);
      const isMatch = await service.verifyPassword(hash, wrongPassword);
      expect(isMatch).toBe(false);
    });

    it('should return false when verifying an invalid hash format', async () => {
      const isMatch = await service.verifyPassword('invalid-hash-format', 'some-password');
      expect(isMatch).toBe(false);
    });
  });
});
