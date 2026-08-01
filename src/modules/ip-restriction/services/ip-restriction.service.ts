import { Injectable } from '@nestjs/common';
import * as ipaddr from 'ipaddr.js';

import { IpRestrictedError } from '../../auth/exceptions/auth.exception';
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
    try {
      const normalizedIp = this.normalizeIp(ip);
      const parsedIp = ipaddr.parse(normalizedIp);

      const parts = cidr.split('/');
      const rangeStr = parts[0];
      const prefixStr = parts[1];

      const parsedRange = ipaddr.parse(rangeStr);
      const prefix = prefixStr ? parseInt(prefixStr, 10) : parsedRange.kind() === 'ipv4' ? 32 : 128;

      // Validate prefix bounds
      if (parsedRange.kind() === 'ipv4') {
        if (prefix < 0 || prefix > 32) return false;
      } else {
        if (prefix < 0 || prefix > 128) return false;
      }

      // Check if kinds are compatible
      if (parsedIp.kind() !== parsedRange.kind()) {
        // If one is IPv4-mapped IPv6, normalize it
        if (parsedIp.kind() === 'ipv6' && (parsedIp as ipaddr.IPv6).isIPv4MappedAddress()) {
          const parsedIpV4 = (parsedIp as ipaddr.IPv6).toIPv4Address();
          if (parsedRange.kind() === 'ipv4') {
            return parsedIpV4.match(parsedRange as ipaddr.IPv4, prefix);
          }
        }
        return false;
      }

      if (parsedIp.kind() === 'ipv4') {
        return parsedIp.match(parsedRange as ipaddr.IPv4, prefix);
      } else {
        return parsedIp.match(parsedRange as ipaddr.IPv6, prefix);
      }
    } catch (err) {
      return false;
    }
  }

  evaluate(ip: string, settings?: AuthenticationSettings): void {
    if (!settings || !settings.ipRestrictionEnabled) {
      return;
    }

    const allowedCidrs = settings.allowedIpCidrs as string[];
    // Restrictions deny by default if allow-list is empty or missing
    if (!allowedCidrs || allowedCidrs.length === 0) {
      throw new IpRestrictedError();
    }

    const isAllowed = allowedCidrs.some((cidr) => this.ipInCidr(ip, cidr));
    if (!isAllowed) {
      throw new IpRestrictedError();
    }
  }
}
