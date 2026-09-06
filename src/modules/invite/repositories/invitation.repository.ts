import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { DeepPartial, In } from 'typeorm';

import { InvitationStatus } from '../../../enums';
import { Invitation } from '../entities/invitation.entity';

@Injectable()
export class InvitationRepository extends BaseRepository<Invitation> {
  constructor(transactionService: TransactionService) {
    super(Invitation, transactionService);
  }

  async bulkSave(invitations: DeepPartial<Invitation>[]): Promise<Invitation[]> {
    return this.repository.save(invitations);
  }

  async findByTokenHashUnscoped(tokenHash: string): Promise<Invitation> {
    return this.findOne({ tokenHash }, { withTenancy: false, required: true });
  }

  async findByTokenHashForUpdateUnscoped(tokenHash: string): Promise<Invitation> {
    return this.findOne(
      { tokenHash },
      { withTenancy: false, required: true, lock: { mode: 'pessimistic_write' } },
    );
  }

  async findPreviousByUser(userId: string): Promise<Invitation | null> {
    return this.findOne(
      {
        userId,
        status: In([InvitationStatus.PENDING, InvitationStatus.SENT]),
      },
      {
        lock: { mode: 'pessimistic_write' },
        order: { sentAt: 'DESC' },
        withTenancy: false,
      },
    );
  }

  async findActiveByUserId(userId: string): Promise<Invitation | null> {
    return this.repository.findOne({
      where: [
        { userId, status: InvitationStatus.PENDING },
        { userId, status: InvitationStatus.SENT },
      ],
    });
  }

  async cancelPendingInvitations(userId: string): Promise<void> {
    await this.repository.update(
      {
        userId,
        tenantCode: this.tenantCode,
        status: In([InvitationStatus.PENDING, InvitationStatus.SENT]),
      },
      { status: InvitationStatus.CANCELLED, revokedAt: new Date() },
    );
  }
}
