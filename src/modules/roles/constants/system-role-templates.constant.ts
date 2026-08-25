import { SystemRoleKey, SystemRoleTemplate } from '../interfaces/system-role-template.interface';

export const SYSTEM_ROLE_TEMPLATES: Record<SystemRoleKey, SystemRoleTemplate> = {
  [SystemRoleKey.EMPLOYEE]: {
    key: SystemRoleKey.EMPLOYEE,
    defaultName: 'Employee',
    description: 'Standard baseline employee access across portal and self-service capabilities.',
    permissions: [
      { code: 'employee.view', isProtected: true },
      { code: 'location.view', isProtected: true },
      { code: 'leave.view', isProtected: true },
      { code: 'leave.request', isProtected: false },
    ],
  },
  [SystemRoleKey.MANAGER]: {
    key: SystemRoleKey.MANAGER,
    defaultName: 'Manager',
    description: 'Standard manager access for direct reports, approvals, and team visibility.',
    permissions: [
      { code: 'employee.view', isProtected: true },
      { code: 'location.view', isProtected: true },
      { code: 'leave.view', isProtected: true },
      { code: 'leave.approve', isProtected: true },
      { code: 'leave.request', isProtected: false },
    ],
  },
  [SystemRoleKey.ADMINISTRATOR]: {
    key: SystemRoleKey.ADMINISTRATOR,
    defaultName: 'Built-in Administrator',
    description:
      'System administrator with protected platform recovery and authorization management rights.',
    permissions: [
      { code: 'employee.view', isProtected: true },
      { code: 'employee.create', isProtected: false },
      { code: 'employee.update', isProtected: false },
      { code: 'employee.archive', isProtected: false },
      { code: 'location.view', isProtected: true },
      { code: 'location.create', isProtected: false },
      { code: 'location.update', isProtected: false },
      { code: 'location.deactivate', isProtected: false },
      { code: 'location.delete', isProtected: false },
      { code: 'role.view', isProtected: true },
      { code: 'role.create', isProtected: true },
      { code: 'role.update', isProtected: true },
      { code: 'role.delete', isProtected: true },
      { code: 'leave.view', isProtected: true },
      { code: 'leave.approve', isProtected: false },
      { code: 'leave.request', isProtected: false },
      { code: 'payroll.view', isProtected: true },
      { code: 'payroll.run', isProtected: false },
    ],
  },
};
