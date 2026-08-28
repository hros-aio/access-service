export interface EmployeeLifecyclePayload {
  employeeId: string;
  tenantCode: string;
  employeeCode?: string;
  companyId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
  gradeId?: string | null;
  jobTitleId?: string | null;
  employmentStatus?: string;
  status?: string;
  oldManagerEmployeeId?: string | null;
  newManagerEmployeeId?: string | null;
  managerEmployeeId?: string | null;
  sourceVersion: number;
}
