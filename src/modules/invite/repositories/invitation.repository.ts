import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { DeepPartial, Repository } from 'typeorm';

import { InvitationStatus } from '../../../enums';
import { Invitation } from '../entities/invitation.entity';

@Injectable()
export class InvitationRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<Invitation> {
    return this.transactionService.getManager().getRepository(Invitation);
  }

  async save(invitation: DeepPartial<Invitation>): Promise<Invitation> {
    return this.repository.save(invitation);
  }

  async bulkSave(invitations: DeepPartial<Invitation>[]): Promise<Invitation[]> {
    return this.repository.save(invitations);
  }

  async find(options: import('typeorm').FindManyOptions<Invitation>): Promise<Invitation[]> {
    return this.repository.find(options);
  }

  async findById(id: string): Promise<Invitation | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findOne(options: import('typeorm').FindOneOptions<Invitation>): Promise<Invitation | null> {
    return this.repository.findOne(options);
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return this.repository.findOne({ where: { tokenHash } });
  }

  async findActiveByUserId(userId: string): Promise<Invitation | null> {
    return this.repository.findOne({
      where: [
        { userId, status: InvitationStatus.PENDING },
        { userId, status: InvitationStatus.SENT },
      ],
    });
  }

  async findPendingForUpdate(
    tenantCode: string,
    userId: string,
    tokenHash?: string,
  ): Promise<Invitation | null> {
    const query = this.repository
      .createQueryBuilder('invitation')
      .innerJoinAndSelect('invitation.user', 'user')
      .where('user.tenantCode = :tenantCode', { tenantCode })
      .andWhere('invitation.userId = :userId', { userId })
      .andWhere("invitation.status IN ('pending', 'sent')");

    if (tokenHash) {
      query.andWhere('invitation.tokenHash = :tokenHash', { tokenHash });
    }

    return query.setLock('pessimistic_write').getOne();
  }

  async findByTenantAndTokenHash(
    tenantCode: string,
    tokenHash: string,
  ): Promise<Invitation | null> {
    return this.repository
      .createQueryBuilder('invitation')
      .innerJoinAndSelect('invitation.user', 'user')
      .where('user.tenantCode = :tenantCode', { tenantCode })
      .andWhere('invitation.tokenHash = :tokenHash', { tokenHash })
      .getOne();
  }

  async cancelPendingInvitations(tenantCode: string, userId: string): Promise<void> {
    await this.repository
      .createQueryBuilder('invitation')
      .update(Invitation)
      .set({ status: InvitationStatus.CANCELLED, revokedAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere("status IN ('pending', 'sent')")
      .andWhere(
        'user_id IN (SELECT id FROM users WHERE id = :userId AND tenant_code = :tenantCode)',
        { tenantCode, userId },
      )
      .execute();
  }
}
