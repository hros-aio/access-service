import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { InvitationStatus } from '../../../enums';
import { Invitation } from '../entities/invitation.entity';

@Injectable()
export class InvitationRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<Invitation> {
    return this.transactionService.getManager().getRepository(Invitation);
  }

  async save(invitation: Invitation): Promise<Invitation> {
    return this.repository.save(invitation);
  }

  async findById(id: string): Promise<Invitation | null> {
    return this.repository.findOne({ where: { id } });
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
}
