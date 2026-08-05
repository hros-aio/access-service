import { Injectable, Optional } from '@nestjs/common';

import { IpRestrictedError } from '../../auth/exceptions/auth.exception';
import { SecurityEventService } from '../../security-event/services/security-event.service';
import { AuthenticationSettings } from '../../tenant/entities/authentication-settings.entity';
import { AuthActionType, IpRangePolicy } from '../domain/ip-range.policy';
import { IpLockoutRedisAdapter } from '../infrastructure/ip-lockout-redis.adapter';

export interface ValidateLocationOptions {
  tenantCode: string;
  sourceIp: string;
  actionType?: AuthActionType;
  userId?: string;
  userAgent?: string;
}

@Injectable()
export class IpRestrictionService {
  private readonly ipSpikeAlertThreshold = 10;

  constructor(
    @Optional() private readonly ipLockoutRedisAdapter?: IpLockoutRedisAdapter,
    @Optional() private readonly securityEventService?: SecurityEventService,
  ) {}

  normalizeIp(ip: string): string {
    return IpRangePolicy.normalizeIp(ip);
  }

  ipInCidr(ip: string, cidr: string): boolean {
    return IpRangePolicy.isIpInCidr(ip, cidr);
  }

  evaluate(ip: string, settings?: AuthenticationSettings, actionType?: AuthActionType): void {
    if (IpRangePolicy.isExemptAction(actionType)) {
      return;
    }

    if (!settings || !settings.ipRestrictionEnabled) {
      return;
    }

    const allowedCidrs = settings.allowedIpCidrs as string[];
    const isAllowed = IpRangePolicy.isIpAllowed(ip, allowedCidrs, actionType);

    if (!isAllowed) {
      throw new IpRestrictedError();
    }
  }

  async validateRequestLocation(
    options: ValidateLocationOptions,
    settings?: AuthenticationSettings,
  ): Promise<boolean> {
    const { tenantCode, sourceIp, actionType, userId, userAgent } = options;

    if (IpRangePolicy.isExemptAction(actionType)) {
      return true;
    }

    if (!settings || !settings.ipRestrictionEnabled) {
      return true;
    }

    const allowedCidrs = settings.allowedIpCidrs as string[];
    const isAllowed = IpRangePolicy.isIpAllowed(sourceIp, allowedCidrs, actionType);

    if (!isAllowed) {
      if (userId && this.ipLockoutRedisAdapter) {
        const failureCount = await this.ipLockoutRedisAdapter.incrementIpFailureCounter(
          tenantCode,
          userId,
        );

        if (this.securityEventService) {
          await this.securityEventService.logLoginFailed(
            tenantCode,
            'unapproved-ip@domain.com',
            sourceIp,
            'IP_NOT_ALLOWED',
            userId,
            userAgent,
          );

          if (failureCount >= this.ipSpikeAlertThreshold) {
            await this.securityEventService.logLoginFailed(
              tenantCode,
              'ip-spike-alert@domain.com',
              sourceIp,
              'UNUSUAL_IP_FAILURE_SPIKE',
              userId,
              userAgent,
            );
          }
        }
      }

      throw new IpRestrictedError();
    }

    return true;
  }
}
