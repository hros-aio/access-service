import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class CryptoAdapter {
  generateToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
