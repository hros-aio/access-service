import { Test, TestingModule } from '@nestjs/testing';

import { IpRestrictionService } from './ip-restriction.service';
import { IpRestrictedError } from '../../auth/exceptions/auth.exception';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';

describe('IpRestrictionService', () => {
  let service: IpRestrictionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IpRestrictionService],
    }).compile();

    service = module.get<IpRestrictionService>(IpRestrictionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeIp', () => {
    it('should strip ::ffff: prefix from mapped IPv4 address', () => {
      expect(service.normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
    });

    it('should leave normal IPv4 address unmodified', () => {
      expect(service.normalizeIp('10.0.0.1')).toBe('10.0.0.1');
    });
  });

  describe('ipInCidr', () => {
    it('should return true if IP falls within CIDR range', () => {
      expect(service.ipInCidr('192.168.1.50', '192.168.1.0/24')).toBe(true);
      expect(service.ipInCidr('10.0.0.1', '10.0.0.0/8')).toBe(true);
    });

    it('should return false if IP falls outside CIDR range', () => {
      expect(service.ipInCidr('192.168.2.50', '192.168.1.0/24')).toBe(false);
      expect(service.ipInCidr('172.16.0.1', '10.0.0.0/8')).toBe(false);
    });

    it('should support full 32-bit single IP match if no bits specified', () => {
      expect(service.ipInCidr('192.168.1.1', '192.168.1.1')).toBe(true);
      expect(service.ipInCidr('192.168.1.2', '192.168.1.1')).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('should succeed silently if IP restriction is disabled', () => {
      const settings = { ipRestrictionEnabled: false } as AuthenticationSettings;
      expect(() => service.evaluate('192.168.2.50', settings)).not.toThrow();
    });

    it('should succeed silently if IP is in allowed CIDR list', () => {
      const settings = {
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24', '10.0.0.0/8'],
      } as unknown as AuthenticationSettings;
      expect(() => service.evaluate('192.168.1.50', settings)).not.toThrow();
    });

    it('should throw IpRestrictedError if IP is not in allowed list', () => {
      const settings = {
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
      } as unknown as AuthenticationSettings;
      expect(() => service.evaluate('8.8.8.8', settings)).toThrow(IpRestrictedError);
    });

    it('should throw IpRestrictedError if allow-list is empty and restrictions enabled', () => {
      const settings = {
        ipRestrictionEnabled: true,
        allowedIpCidrs: [],
      } as unknown as AuthenticationSettings;
      expect(() => service.evaluate('192.168.1.50', settings)).toThrow(IpRestrictedError);
    });
  });
});
