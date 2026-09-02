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

  it('should return capabilities when authenticated request context is provided', async () => {
    const response = await controller.getCapabilities();

    expect(response.authorizationVersion).toBe(7);
    expect(response.permissions).toEqual(['employee.view', 'leave.apply', 'leave.approve']);
    expect(mockBootstrapService.getBootstrapCapabilities).toHaveBeenCalled();
  });
});
