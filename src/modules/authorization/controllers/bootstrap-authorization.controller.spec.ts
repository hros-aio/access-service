import { UnauthorizedException } from '@nestjs/common';
import { RequestContext } from '@new-hros/libs-core';

import { BootstrapAuthorizationController } from './bootstrap-authorization.controller';
import { BootstrapAuthorizationService } from '../services/bootstrap-authorization.service';

describe('BootstrapAuthorizationController', () => {
  let controller: BootstrapAuthorizationController;

  const mockBootstrapService = {
    getBootstrapCapabilities: jest.fn().mockResolvedValue({
      authorizationVersion: 7,
      permissions: ['employee.view', 'leave.apply', 'leave.approve'],
      modules: ['employee', 'leave'],
      roles: ['Employee', 'Manager'],
    }),
  };

  beforeEach(() => {
    controller = new BootstrapAuthorizationController(
      mockBootstrapService as unknown as BootstrapAuthorizationService,
    );
  });

  it('should throw UnauthorizedException when request context is unauthenticated', async () => {
    const unauthenticatedReq = {} as unknown as RequestContext;
    await expect(controller.getCapabilities(unauthenticatedReq)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should return capabilities when authenticated request context is provided', async () => {
    const authenticatedReq = {
      tenantCode: 'tenant-test',
      user: {
        userId: 'user-test',
      },
    } as unknown as RequestContext;

    const response = await controller.getCapabilities(authenticatedReq);

    expect(response.success).toBe(true);
    expect(response.data.authorizationVersion).toBe(7);
    expect(response.data.permissions).toEqual(['employee.view', 'leave.apply', 'leave.approve']);
    expect(mockBootstrapService.getBootstrapCapabilities).toHaveBeenCalledWith(
      'tenant-test',
      'user-test',
    );
  });
});
