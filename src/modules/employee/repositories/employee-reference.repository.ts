import { Injectable } from '@nestjs/common';
import { BaseRepository, TransactionService } from '@new-hros/libs-sql';
import { In } from 'typeorm';

import { EmployeeReference } from '../entities/employee-reference.entity';

import { EmployeeStatus } from '@/enums/employee-status.enum';

export interface UpsertEmployeeProjectionInput {
  id: string;
  tenantCode: string;
  employeeCode: string;
  companyId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
  gradeId?: string | null;
  jobTitleId?: string | null;
  employmentStatus?: string;
  status?: string;
  managerEmployeeId?: string | null;
  sourceVersion: number;
}

@Injectable()
export class EmployeeReferenceRepository extends BaseRepository<EmployeeReference> {
  constructor(transactionService: TransactionService) {
    super(EmployeeReference, transactionService);
  }

  async findByEmployeeId(
    tenantCode: string,
    employeeId: string,
  ): Promise<EmployeeReference | null> {
    return this.findOne({ tenantCode, id: employeeId });
  }

  async findByCode(tenantCode: string, employeeCode: string): Promise<EmployeeReference | null> {
    return this.repository.findOne({ where: { tenantCode, employeeCode } });
  }

  async countEmployeesByTenant(tenantCode: string): Promise<number> {
    return this.repository.count({ where: { tenantCode, status: EmployeeStatus.ACTIVE } });
  }

  async findEmployeesBatch(
    tenantCode: string,
    skip: number,
    take: number,
  ): Promise<EmployeeReference[]> {
    return this.repository.find({
      where: { tenantCode, status: 'ACTIVE' },
      skip,
      take,
      order: { synchronizedAt: 'ASC' },
    });
  }

  /**
   * Atomically updates reportees_count for a manager (with delta +1 or -1).
   * Ensures reportees_count never drops below 0.
   */
  async updateReporteesCount(tenantCode: string, employeeId: string, delta: number): Promise<void> {
    const manager = this.transactionService.getManager();
    await manager.query(
      `
      UPDATE employee_references
      SET reportees_count = GREATEST(0, reportees_count + $1),
          synchronized_at = NOW()
      WHERE tenant_code = $2 AND id = $3
      `,
      [delta, tenantCode, employeeId],
    );
  }

  async getMatchedEmployeeIds(sql: string, params: unknown[]): Promise<string[]> {
    const manager = this.transactionService.getManager();
    const rows = (await manager.query(sql, params)) as Array<{ employee_id: string }>;
    const matchedEmployeeIds: string[] = rows.map((r) => r.employee_id);

    if (matchedEmployeeIds.length === 0) {
      return [];
    }

    return matchedEmployeeIds;
  }

  async findByIds(tenantCode: string, ids: string[]): Promise<EmployeeReference[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.repository.find({
      where: { tenantCode, id: In(ids) },
    });
  }
}
