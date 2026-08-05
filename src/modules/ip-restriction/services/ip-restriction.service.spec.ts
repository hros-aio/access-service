import { Test, TestingModule } from '@nestjs/testing';

import { IpRestrictionService } from './ip-restriction.service';
import { IpRestrictedError } from '../../auth/exceptions/auth.exception';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { AuthActionType } from '../domain/ip-range.policy';
import { IpLockoutRedisAdapter } from '../infrastructure/ip-lockout-redis.adapter';

describe('IpRestrictionService', () => {
  let service: IpRestrictionService;
  let redisAdapterMock: jest.Mocked<Partial<IpLockoutRedisAdapter>>;
  let securityEventServiceMock: jest.Mocked<Partial<SecurityEventService>>;

  beforeEach(async () => {
    redisAdapterMock = {
      incrementIpFailureCounter: jest.fn().mockResolvedValue(1),
    };
    securityEventServiceMock = {
      logLoginFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRestrictionService,
        { provide: IpLockoutRedisAdapter, useValue: redisAdapterMock },
        { provide: SecurityEventService, useValue: securityEventServiceMock },
      ],
    }).compile();

    service = module.get<IpRestrictionService>(IpRestrictionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateRequestLocation', () => {
    it('should allow access if action is exempt', async () => {
      const res = await service.validateRequestLocation({
        tenantCode: 'TENANT1',
        sourceIp: '10.0.0.1',
        actionType: AuthActionType.PASSWORD_RESET,
      });
      expect(res).toBe(true);
    });

    it('should allow access if IP restriction is disabled', async () => {
      const settings = { ipRestrictionEnabled: false } as AuthenticationSettings;
      const res = await service.validateRequestLocation(
        {
          tenantCode: 'TENANT1',
          sourceIp: '10.0.0.1',
          actionType: AuthActionType.PASSWORD_LOGIN,
        },
        settings,
      );
      expect(res).toBe(true);
    });

    it('should allow access if IP is in allowed list', async () => {
      const settings = {
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
      } as unknown as AuthenticationSettings;
      const res = await service.validateRequestLocation(
        {
          tenantCode: 'TENANT1',
          sourceIp: '192.168.1.50',
          actionType: AuthActionType.PASSWORD_LOGIN,
        },
        settings,
      );
      expect(res).toBe(true);
    });

    it('should deny access and emit events if IP is unapproved', async () => {
      const settings = {
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
      } as unknown as AuthenticationSettings;

      await expect(
        service.validateRequestLocation(
          {
            tenantCode: 'TENANT1',
            sourceIp: '10.0.0.1',
            actionType: AuthActionType.PASSWORD_LOGIN,
            userId: 'usr_1',
          },
          settings,
        ),
      ).rejects.toThrow(IpRestrictedError);

      expect(redisAdapterMock.incrementIpFailureCounter).toHaveBeenCalledWith('TENANT1', 'usr_1');
      expect(securityEventServiceMock.logLoginFailed).toHaveBeenCalledWith(
        'TENANT1',
        'unapproved-ip@domain.com',
        '10.0.0.1',
        'IP_NOT_ALLOWED',
        'usr_1',
        undefined,
      );
    });

    it('should emit security alert when spike threshold is reached', async () => {
      (redisAdapterMock.incrementIpFailureCounter as jest.Mock).mockResolvedValue(10);
      const settings = {
        ipRestrictionEnabled: true,
        allowedIpCidrs: ['192.168.1.0/24'],
      } as unknown as AuthenticationSettings;

      await expect(
        service.validateRequestLocation(
          {
            tenantCode: 'TENANT1',
            sourceIp: '10.0.0.1',
            actionType: AuthActionType.PASSWORD_LOGIN,
            userId: 'usr_1',
          },
          settings,
        ),
      ).rejects.toThrow(IpRestrictedError);

      expect(securityEventServiceMock.logLoginFailed).toHaveBeenCalledTimes(2);
    });
  });
});
