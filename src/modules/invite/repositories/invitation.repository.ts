import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

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
        { userId, status: 'pending' },
        { userId, status: 'sent' },
      ],
    });
  }
}
