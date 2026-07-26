import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { Repository } from 'typeorm';

import { EmployeeReference } from '../entities/employee-reference.entity';

@Injectable()
export class EmployeeReferenceRepository {
  constructor(private readonly transactionService: TransactionService) {}

  private get repository(): Repository<EmployeeReference> {
    return this.transactionService.getManager().getRepository(EmployeeReference);
  }

  async save(employeeRef: EmployeeReference): Promise<EmployeeReference> {
    return this.repository.save(employeeRef);
  }

  async findById(employeeId: string): Promise<EmployeeReference | null> {
    return this.repository.findOne({ where: { employeeId } });
  }

  async findByCode(tenantCode: string, employeeCode: string): Promise<EmployeeReference | null> {
    return this.repository.findOne({ where: { tenantCode, employeeCode } });
  }

  async exists(employeeId: string): Promise<boolean> {
    const count = await this.repository.count({ where: { employeeId } });
    return count > 0;
  }
}
