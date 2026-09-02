import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@new-hros/libs-core';
import { TransactionService } from '@new-hros/libs-sql';

import { UserGroupImpactService } from './user-group-impact.service';
import { AuthSecurityEventOutbox } from '../../auth/entities/auth-security-event-outbox.entity';
import { AuthSecurityEventOutboxRepository } from '../../auth/repositories/auth-security-event-outbox.repository';
import { UserGroupAggregate } from '../domain/aggregates/user-group.aggregate';
import {
  ConcurrentModificationError,
  HighImpactConfirmationRequiredError,
} from '../domain/exceptions/user-group.exceptions';
import { UpdateUserGroupScopeDto } from '../dto/update-user-group-scope.dto';
import { UserGroupScopeDetailsDto } from '../dto/user-group-scope-details.dto';
import { UserGroupRepository } from '../repositories/user-group.repository';

@Injectable()
export class UserGroupScopeService {
  private readonly logger = new Logger(UserGroupScopeService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly userGroupRepository: UserGroupRepository,
    private readonly outboxRepository: AuthSecurityEventOutboxRepository,
    private readonly impactService: UserGroupImpactService,
  ) {}

  async getScope(id: string): Promise<UserGroupScopeDetailsDto> {
    const group = await this.userGroupRepository.findById(id, { required: true });

    return UserGroupScopeDetailsDto.fromEntity(group);
  }

  async updateScope(id: string, dto: UpdateUserGroupScopeDto): Promise<UserGroupScopeDetailsDto> {
    const tenantCode = RequestContextService.getTenantCode();
    const userId = RequestContextService.getUser()?.userId;

    const existingGroup = await this.userGroupRepository.findById(id, { required: true });
    if (existingGroup.version !== dto.expectedVersion) {
      throw new ConcurrentModificationError();
    }

    // Impact blast radius estimation and confirmation check
    const impact = await this.impactService.estimateScopeImpact(id, dto.scopeType, dto.scopeRefId);

    if (impact.requiresConfirmation && dto.confirmed !== true) {
      throw new HighImpactConfirmationRequiredError({
        affectedUserCount: impact.affectedUserCount,
        threshold: impact.threshold,
      });
    }

    const aggregate = UserGroupAggregate.reconstruct(existingGroup);
    const { previousScope, newScope } = aggregate.updateScope(
      {
        scopeType: dto.scopeType,
        scopeRefId: dto.scopeRefId,
      },
      userId,
    );

    return this.transactionService.runInTransaction(async () => {
      existingGroup.scopeType = aggregate.scopeType;
      existingGroup.scopeRefId = aggregate.scopeRefId;
      existingGroup.version = aggregate.version;
      existingGroup.updatedBy = aggregate.updatedBy;

      const savedGroup = await this.userGroupRepository.save(existingGroup);

      // Persist Audit and Domain events into Transactional Outbox
      const outboxContext = { tenantCode, userId };

      const scopeUpdatedOutbox = AuthSecurityEventOutbox.fromUserGroupScopeUpdated(outboxContext, {
        userGroup: savedGroup,
        previousScope,
        newScope,
      });
      await this.outboxRepository.save(scopeUpdatedOutbox);

      const syncOutbox = AuthSecurityEventOutbox.fromAuthorizationUserGroupUpdated(outboxContext, {
        userGroup: savedGroup,
      });
      await this.outboxRepository.save(syncOutbox);

      return UserGroupScopeDetailsDto.fromEntity(savedGroup);
    });
  }
}
