import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class CredentialDomainService {
  async hashPassword(password: string): Promise<{ hash: string; algorithm: string }> {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    return { hash, algorithm: 'argon2id' };
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
