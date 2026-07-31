import { Injectable } from '@nestjs/common';

import { InvalidCredentialsError } from '../../auth/exceptions/auth.exception';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';

@Injectable()
export class IpRestrictionService {
  normalizeIp(ip: string): string {
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  ipInCidr(ip: string, cidr: string): boolean {
    const normalized = this.normalizeIp(ip);
    const parts = cidr.split('/');
    const range = parts[0];
    const bitsStr = parts[1];
    const bits = bitsStr ? parseInt(bitsStr, 10) : 32;

    const ipParts = normalized.split('.');
    const rangeParts = range.split('.');

    if (ipParts.length !== 4 || rangeParts.length !== 4) {
      return normalized === range;
    }

    const ipNum =
      ((parseInt(ipParts[0], 10) << 24) >>> 0) +
      ((parseInt(ipParts[1], 10) << 16) >>> 0) +
      ((parseInt(ipParts[2], 10) << 8) >>> 0) +
      (parseInt(ipParts[3], 10) >>> 0);

    const rangeNum =
      ((parseInt(rangeParts[0], 10) << 24) >>> 0) +
      ((parseInt(rangeParts[1], 10) << 16) >>> 0) +
      ((parseInt(rangeParts[2], 10) << 8) >>> 0) +
      (parseInt(rangeParts[3], 10) >>> 0);

    const mask = bits === 0 ? 0 : ~0 << (32 - bits);

    return (ipNum & mask) === (rangeNum & mask);
  }

  evaluate(ip: string, settings?: AuthenticationSettings): void {
    if (!settings || !settings.ipRestrictionEnabled) {
      return;
    }

    const allowedCidrs = settings.allowedIpCidrs as string[];
    if (!allowedCidrs || allowedCidrs.length === 0) {
      return;
    }

    const isAllowed = allowedCidrs.some((cidr) => this.ipInCidr(ip, cidr));
    if (!isAllowed) {
      throw new InvalidCredentialsError();
    }
  }
}
