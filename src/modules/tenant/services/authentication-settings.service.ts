import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { EntityManager } from 'typeorm';

import {
  AuthenticationSettingsResponseDto,
  UpdateAuthenticationSettingsDto,
} from '../dto/authentication-settings.dto';
import { AuthenticationSettings } from '../entities/authentication-settings.entity';
import { AuthenticationSettingsRepository } from '../repositories/authentication-settings.repository';

@Injectable()
export class AuthenticationSettingsService {
  constructor(
    private readonly repository: AuthenticationSettingsRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async getSettings(tenantCode: string): Promise<AuthenticationSettingsResponseDto> {
    const settings = await this.repository.findByTenantCode(tenantCode);
    if (!settings) {
      throw new NotFoundException(`Authentication settings not found for tenant: ${tenantCode}`);
    }
    return this.mapToDto(settings, tenantCode);
  }

  async updateSettings(
    tenantCode: string,
    dto: UpdateAuthenticationSettingsDto,
    userId: string,
  ): Promise<AuthenticationSettingsResponseDto> {
    let updatedSettings!: AuthenticationSettings;

    await this.transactionService.runInTransaction(async () => {
      const entityManager: EntityManager = this.transactionService.getManager();
      const current = await this.repository.findByTenantCode(tenantCode);
      if (!current) {
        throw new NotFoundException(`Authentication settings not found for tenant: ${tenantCode}`);
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {};
      const fieldsToUpdate: Partial<AuthenticationSettings> = {};

      if (dto.mfaRequired !== undefined && dto.mfaRequired !== current.restrictedMfaEnabled) {
        changes.restrictedMfaEnabled = { old: current.restrictedMfaEnabled, new: dto.mfaRequired };
        fieldsToUpdate.restrictedMfaEnabled = dto.mfaRequired;
      }

      if (
        dto.selfServicePasswordResetEnabled !== undefined &&
        dto.selfServicePasswordResetEnabled !== current.needAdminResetPassword
      ) {
        changes.needAdminResetPassword = {
          old: current.needAdminResetPassword,
          new: dto.selfServicePasswordResetEnabled,
        };
        fieldsToUpdate.needAdminResetPassword = dto.selfServicePasswordResetEnabled;
      }

      if (
        dto.lockoutEnabled !== undefined &&
        dto.lockoutEnabled !== current.accountLockoutEnabled
      ) {
        changes.accountLockoutEnabled = {
          old: current.accountLockoutEnabled,
          new: dto.lockoutEnabled,
        };
        fieldsToUpdate.accountLockoutEnabled = dto.lockoutEnabled;
      }

      if (dto.lockoutThreshold !== undefined && dto.lockoutThreshold !== current.maxFailedRetries) {
        changes.maxFailedRetries = { old: current.maxFailedRetries, new: dto.lockoutThreshold };
        fieldsToUpdate.maxFailedRetries = dto.lockoutThreshold;
      }

      if (
        dto.ipRestrictionEnabled !== undefined &&
        dto.ipRestrictionEnabled !== current.ipRestrictionEnabled
      ) {
        changes.ipRestrictionEnabled = {
          old: current.ipRestrictionEnabled,
          new: dto.ipRestrictionEnabled,
        };
        fieldsToUpdate.ipRestrictionEnabled = dto.ipRestrictionEnabled;
      }

      if (dto.ipAllowList !== undefined) {
        changes.allowedIpCidrs = { old: current.allowedIpCidrs, new: dto.ipAllowList };
        fieldsToUpdate.allowedIpCidrs = dto.ipAllowList;
      }

      updatedSettings = await this.repository.updateWithOptimisticLock(
        tenantCode,
        dto.version,
        fieldsToUpdate,
      );

      if (Object.keys(changes).length > 0) {
        await entityManager
          .createQueryBuilder()
          .insert()
          .into('auth_security_events_outbox')
          .values({
            tenant_code: tenantCode,
            user_id: userId === 'system' ? null : userId,
            event_type: 'authentication.settings-updated',
            sanitized_payload: {
              tenantCode,
              updatedByUserId: userId,
              changes,
              updatedAt: updatedSettings.updatedAt,
            },
            publish_status: 'pending',
          })
          .execute();
      }
    });

    return this.mapToDto(updatedSettings, tenantCode);
  }

  private mapToDto(
    entity: AuthenticationSettings,
    fallbackTenantCode: string,
  ): AuthenticationSettingsResponseDto {
    return {
      tenantCode: entity.tenant?.tenantCode ?? fallbackTenantCode,
      mfaRequired: entity.restrictedMfaEnabled,
      selfServicePasswordResetEnabled: entity.needAdminResetPassword,
      lockoutEnabled: entity.accountLockoutEnabled,
      lockoutThreshold: entity.maxFailedRetries,
      ipRestrictionEnabled: entity.ipRestrictionEnabled,
      ipAllowList: Array.isArray(entity.allowedIpCidrs) ? (entity.allowedIpCidrs as string[]) : [],
      version: entity.version,
      updatedAt: entity.updatedAt,
    };
  }
}
