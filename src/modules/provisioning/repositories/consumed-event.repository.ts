import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { ConsumedEvent } from '../entities/consumed-event.entity';

@Injectable()
export class ConsumedEventRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<ConsumedEvent> {
    return this.transactionService.getManager().getRepository(ConsumedEvent);
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.repository.count({ where: { id } });
    return count > 0;
  }

  async save(event: ConsumedEvent): Promise<ConsumedEvent> {
    return this.repository.save(event);
  }
}
