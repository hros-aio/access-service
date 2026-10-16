import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization';
import { EmployeeModule } from './employee/employee.module';
import { ImpactAnalysisModule } from './impact-analysis';
import { InviteModule } from './invite/invite.module';
import { MfaModule } from './mfa/mfa.module';
import { PasswordModule } from './password/password.module';
import { PermissionsModule } from './permissions';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { RoleModule } from './roles';
import { SecurityEventModule } from './security-event';
import { TenantModule } from './tenant/tenant.module';
import { UserModule } from './user/user.module';
import { UserGroupModule } from './user-groups';

export const modules = [
  TenantModule,
  EmployeeModule,
  UserModule,
  InviteModule,
  AuthModule,
  MfaModule,
  PasswordModule,
  PermissionsModule,
  RoleModule,
  UserGroupModule,
  ImpactAnalysisModule,
  AuthorizationModule,
  ProvisioningModule,
  SecurityEventModule,
];
