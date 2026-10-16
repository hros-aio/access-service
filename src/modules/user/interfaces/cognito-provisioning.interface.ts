export interface ProvisionCognitoUserInput {
  readonly userId: string;
  readonly email: string;
  readonly tenantCode: string;
  readonly userType?: string;
  readonly suppressNotification?: boolean;
  readonly isEmailVerified?: boolean;
}

export type CognitoProvisioningAction = 'CREATED' | 'LINKED_EXISTING';

export interface CognitoProvisioningResult {
  readonly userId: string;
  readonly externalIdentityId: string;
  readonly username: string;
  readonly action: CognitoProvisioningAction;
}
