import * as ipaddr from 'ipaddr.js';

export enum AuthActionType {
  PASSWORD_LOGIN = 'PASSWORD_LOGIN',
  MFA_VERIFY = 'MFA_VERIFY',
  SSO_LOGIN = 'SSO_LOGIN',
  INVITATION_VALIDATION = 'INVITATION_VALIDATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

export class IpRangePolicy {
  public static isExemptAction(actionType?: AuthActionType): boolean {
    if (!actionType) return false;
    return (
      actionType === AuthActionType.INVITATION_VALIDATION ||
      actionType === AuthActionType.PASSWORD_RESET
    );
  }

  public static normalizeIp(ip: string): string {
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  public static isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const normalizedIp = this.normalizeIp(ip);
      const parsedIp = ipaddr.parse(normalizedIp);

      const parts = cidr.split('/');
      const rangeStr = parts[0];
      const prefixStr = parts[1];

      const parsedRange = ipaddr.parse(rangeStr);
      const prefix = prefixStr ? parseInt(prefixStr, 10) : parsedRange.kind() === 'ipv4' ? 32 : 128;

      if (parsedRange.kind() === 'ipv4') {
        if (prefix < 0 || prefix > 32) return false;
      } else {
        if (prefix < 0 || prefix > 128) return false;
      }

      if (parsedIp.kind() !== parsedRange.kind()) {
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
    } catch {
      return false;
    }
  }

  public static isIpAllowed(
    ip: string,
    allowedCidrs: string[],
    actionType?: AuthActionType,
  ): boolean {
    if (this.isExemptAction(actionType)) {
      return true;
    }

    if (!allowedCidrs || allowedCidrs.length === 0) {
      return false;
    }

    return allowedCidrs.some((cidr) => this.isIpInCidr(ip, cidr));
  }
}
