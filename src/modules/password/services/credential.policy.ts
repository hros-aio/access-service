import { Injectable } from '@nestjs/common';

@Injectable()
export class CredentialPolicy {
  validatePasswordStrength(password: string): boolean {
    if (!password || password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
  }
}
