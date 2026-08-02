import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';

export interface KmsCryptoProvider {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

@Injectable()
export class KmsCryptoAdapter implements KmsCryptoProvider {
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: Buffer;

  constructor() {
    const rawKey = process.env.KMS_MASTER_KEY || 'default-kms-master-key-32-bytes!!';
    this.masterKey = Buffer.alloc(32);
    Buffer.from(rawKey).copy(this.masterKey);
  }

  public async encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.masterKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  public async decrypt(ciphertext: string): Promise<string> {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
