import { AuthActionType, IpRangePolicy } from './ip-range.policy';

describe('IpRangePolicy', () => {
  describe('isExemptAction', () => {
    it('should identify invitation and password reset actions as exempt', () => {
      expect(IpRangePolicy.isExemptAction(AuthActionType.INVITATION_VALIDATION)).toBe(true);
      expect(IpRangePolicy.isExemptAction(AuthActionType.PASSWORD_RESET)).toBe(true);
    });

    it('should identify login and mfa actions as non-exempt', () => {
      expect(IpRangePolicy.isExemptAction(AuthActionType.PASSWORD_LOGIN)).toBe(false);
      expect(IpRangePolicy.isExemptAction(AuthActionType.MFA_VERIFY)).toBe(false);
      expect(IpRangePolicy.isExemptAction(AuthActionType.SSO_LOGIN)).toBe(false);
    });
  });

  describe('isIpInCidr', () => {
    it('should match valid IPv4 within subnet', () => {
      expect(IpRangePolicy.isIpInCidr('192.168.1.50', '192.168.1.0/24')).toBe(true);
      expect(IpRangePolicy.isIpInCidr('10.0.0.1', '192.168.1.0/24')).toBe(false);
    });

    it('should match valid IPv6 within subnet', () => {
      expect(IpRangePolicy.isIpInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
      expect(IpRangePolicy.isIpInCidr('2001:other::1', '2001:db8::/32')).toBe(false);
    });

    it('should handle IPv4-mapped IPv6 addresses', () => {
      expect(IpRangePolicy.isIpInCidr('::ffff:192.168.1.50', '192.168.1.0/24')).toBe(true);
    });
  });

  describe('isIpAllowed', () => {
    it('should allow access if action is exempt even with unapproved IP', () => {
      expect(
        IpRangePolicy.isIpAllowed('10.0.0.1', ['192.168.1.0/24'], AuthActionType.PASSWORD_RESET),
      ).toBe(true);
    });

    it('should deny access if IP is not in allow-list for non-exempt action', () => {
      expect(
        IpRangePolicy.isIpAllowed('10.0.0.1', ['192.168.1.0/24'], AuthActionType.PASSWORD_LOGIN),
      ).toBe(false);
    });

    it('should allow access if IP is in allow-list for non-exempt action', () => {
      expect(
        IpRangePolicy.isIpAllowed(
          '192.168.1.10',
          ['192.168.1.0/24'],
          AuthActionType.PASSWORD_LOGIN,
        ),
      ).toBe(true);
    });
  });
});
