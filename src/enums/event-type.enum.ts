export enum EventType {
  TENANT_CREATED = 'tenant.created',
  AUTHENTICATION_USER_PROVISIONED = 'authentication.user-provisioned',
  EMPLOYEE_SUSPENDED = 'employee.suspended',
  EMPLOYEE_TERMINATED = 'employee.terminated',
  EMPLOYEE_REACTIVATED = 'employee.reactivated',
  AUTHENTICATION_SESSIONS_REVOKED = 'authentication.sessions-revoked',
  AUTHENTICATION_USER_INVITED = 'authentication.user-invited',
}
