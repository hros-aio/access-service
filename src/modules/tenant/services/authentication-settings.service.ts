import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';

import { UpdateAuthenticationSettingsDto } from '../dto/authentication-settings.dto';
import { AuthenticationSettings } from '../entities/authentication-settings.entity';
import { AuthenticationSettingsRepository } from '../repositories/authentication-settings.repository';

@Injectable()
export class AuthenticationSettingsService {
  constructor(
    private readonly repository: AuthenticationSettingsRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async getSettings(): Promise<AuthenticationSettings> {
    return this.repository.findOne({}, { required: true });
  }

  async upsertSettings(dto: UpdateAuthenticationSettingsDto): Promise<AuthenticationSettings> {
    let updatedSettings!: AuthenticationSettings;

    await this.transactionService.runInTransaction(async () => {
      const current = await this.repository.findOne({});
      if (!current) {
        updatedSettings = await this.repository.create(dto);
        return updatedSettings;
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
        current.id,
        dto.version,
        fieldsToUpdate,
      );
      return updatedSettings;
    });

    return updatedSettings;
  }
}
