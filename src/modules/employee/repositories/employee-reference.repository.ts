import { Injectable } from '@nestjs/common';
import { TransactionService } from '@new-hros/libs-sql';
import { FindOneOptions, Repository } from 'typeorm';

import { EmployeeReference } from '../entities/employee-reference.entity';

export interface UpsertEmployeeProjectionInput {
  employeeId: string;
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

  async findByEmployeeId(
    tenantCode: string,
    employeeId: string,
  ): Promise<EmployeeReference | null> {
    return this.repository.findOne({ where: { tenantCode, employeeId } });
  }

  async findOne(options: FindOneOptions<EmployeeReference>): Promise<EmployeeReference | null> {
    return this.repository.findOne(options);
  }

  async findByCode(tenantCode: string, employeeCode: string): Promise<EmployeeReference | null> {
    return this.repository.findOne({ where: { tenantCode, employeeCode } });
  }

  async exists(employeeId: string): Promise<boolean> {
    const count = await this.repository.count({ where: { employeeId } });
    return count > 0;
  }

  /**
   * Upserts the projection if sourceVersion is greater than stored version.
   * Returns true if row was inserted or updated, false if discarded due to stale version.
   */
  async upsertProjection(data: UpsertEmployeeProjectionInput): Promise<boolean> {
    const manager = this.transactionService.getManager();
    const result = await manager.query(
      `
      INSERT INTO employee_references (
        employee_id, tenant_code, employee_code, company_id, location_id,
        department_id, grade_id, job_title_id, employment_status, status,
        manager_employee_id, source_version, synchronized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (tenant_code, employee_id) DO UPDATE SET
        employee_code = EXCLUDED.employee_code,
        company_id = EXCLUDED.company_id,
        location_id = EXCLUDED.location_id,
        department_id = EXCLUDED.department_id,
        grade_id = EXCLUDED.grade_id,
        job_title_id = EXCLUDED.job_title_id,
        employment_status = EXCLUDED.employment_status,
        status = EXCLUDED.status,
        manager_employee_id = EXCLUDED.manager_employee_id,
        source_version = EXCLUDED.source_version,
        synchronized_at = NOW()
      WHERE EXCLUDED.source_version > employee_references.source_version
      RETURNING employee_id;
      `,
      [
        data.employeeId,
        data.tenantCode,
        data.employeeCode,
        data.companyId || null,
        data.locationId || null,
        data.departmentId || null,
        data.gradeId || null,
        data.jobTitleId || null,
        data.employmentStatus || 'ACTIVE',
        data.status || 'ACTIVE',
        data.managerEmployeeId || null,
        data.sourceVersion,
      ],
    );

    return Array.isArray(result) && result.length > 0;
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
      WHERE tenant_code = $2 AND employee_id = $3
      `,
      [delta, tenantCode, employeeId],
    );
  }
}
