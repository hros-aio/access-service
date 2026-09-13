export interface AuthorizationSyncRequestedPayload {
  jobId: string;
  tenantCode: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
  triggerType: string;
  initiatedBy?: string;
  timestamp?: string;
}
