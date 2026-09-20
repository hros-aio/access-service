import { AuthorizationHandler } from './authorization.handler';
import { EmployeeLifecycleHandler } from './employee-lifecycle.handler';
import { TenantProvisioningHandler } from './tenant-provisioning.handler';

export const Handlers = [AuthorizationHandler, EmployeeLifecycleHandler, TenantProvisioningHandler];
