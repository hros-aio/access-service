import { LogoutResponseDto } from '../dto/logout-response.dto';

export interface ForceLogoutCommand {
  readonly tenantCode: string;
  readonly targetUserId: string;
  readonly adminUserId: string;
  readonly reason?: string;
}

export interface ISessionService {
  logoutCurrentSession(
    tenantCode: string,
    userId: string,
    sessionId: string,
  ): Promise<LogoutResponseDto>;
  revokeAllUserSessions(command: ForceLogoutCommand): Promise<LogoutResponseDto>;
}

export const SESSION_SERVICE_TOKEN = Symbol('SESSION_SERVICE_TOKEN');
export const REDIS_SESSION_ADAPTER_TOKEN = Symbol('REDIS_SESSION_ADAPTER_TOKEN');
