/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import {
  CognitoInternalException,
  CognitoService,
  CognitoUserAlreadyExistsException,
} from '@new-hros/libs-aws';

import { CognitoUserProvisioningService } from './cognito-user-provisioning.service';
import { CognitoProvisioningException } from '../domain/exceptions/cognito-provisioning.exception';
import { UserRepository } from '../repositories/user.repository';

import { SecurityEventService } from '@/modules/security-event/services/security-event.service';

describe('CognitoUserProvisioningService', () => {
  let service: CognitoUserProvisioningService;
  let mockCognitoService: any;
  let mockUserRepository: any;
  let mockSecurityEventService: any;

  beforeEach(async () => {
    mockCognitoService = {
      createUser: jest.fn(),
      getUser: jest.fn(),
      updateUser: jest.fn(),
    };

    mockUserRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findById: jest.fn(),
      findByTenantAndExternalIdentity: jest.fn().mockResolvedValue(null),
    };

    mockSecurityEventService = {
      logCognitoUserProvisioned: jest.fn().mockResolvedValue(undefined),
      logCognitoProvisioningFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CognitoUserProvisioningService,
        { provide: CognitoService, useValue: mockCognitoService },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: SecurityEventService, useValue: mockSecurityEventService },
      ],
    }).compile();

    service = module.get<CognitoUserProvisioningService>(CognitoUserProvisioningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('US1: Automated Cloud Identity Provisioning', () => {
    it('should create cognito user with email_verified: false by default, update user entity, and emit outbox event', async () => {
      const input = {
        userId: '11111111-1111-1111-1111-111111111111',
        email: ' Admin@Example.com ',
        tenantCode: 'TENANT_A',
        userType: 'admin',
        suppressNotification: true,
      };

      mockCognitoService.createUser.mockResolvedValueOnce({
        username: 'admin@example.com',
        attributes: {
          sub: 'cognito-sub-12345',
          email: 'admin@example.com',
          email_verified: 'false',
          'custom:tenant_code': 'TENANT_A',
        },
        enabled: true,
        userStatus: 'FORCE_CHANGE_PASSWORD',
      });

      const result = await service.provisionCognitoUser(input);

      expect(mockCognitoService.createUser).toHaveBeenCalledWith({
        username: 'admin@example.com',
        userAttributes: {
          email: 'admin@example.com',
          email_verified: 'false',
          'custom:tenant_code': 'TENANT_A',
        },
        messageAction: 'SUPPRESS',
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        { externalIdentityId: 'cognito-sub-12345' },
      );

      expect(mockSecurityEventService.logCognitoUserProvisioned).toHaveBeenCalledWith(
        'TENANT_A',
        '11111111-1111-1111-1111-111111111111',
        'admin@example.com',
        'cognito-sub-12345',
        'CREATED',
      );

      expect(result).toEqual({
        userId: '11111111-1111-1111-1111-111111111111',
        externalIdentityId: 'cognito-sub-12345',
        username: 'admin@example.com',
        action: 'CREATED',
      });
    });

    it('should set email_verified: true when isEmailVerified is true, and omit messageAction when suppressNotification is false', async () => {
      const input = {
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'admin@example.com',
        tenantCode: 'TENANT_A',
        suppressNotification: false,
        isEmailVerified: true,
      };

      mockCognitoService.createUser.mockResolvedValueOnce({
        username: 'admin@example.com',
        attributes: {
          sub: 'cognito-sub-12345',
          email: 'admin@example.com',
          email_verified: 'true',
          'custom:tenant_code': 'TENANT_A',
        },
        enabled: true,
        userStatus: 'FORCE_CHANGE_PASSWORD',
      });

      await service.provisionCognitoUser(input);

      expect(mockCognitoService.createUser).toHaveBeenCalledWith({
        username: 'admin@example.com',
        userAttributes: {
          email: 'admin@example.com',
          email_verified: 'true',
          'custom:tenant_code': 'TENANT_A',
        },
        messageAction: undefined,
      });
    });

    it('should throw CognitoProvisioningException when sub is absent from created user record', async () => {
      const input = {
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'admin@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser.mockResolvedValueOnce({
        username: 'admin@example.com',
        attributes: {
          email: 'admin@example.com',
        },
        enabled: true,
        userStatus: 'FORCE_CHANGE_PASSWORD',
      });

      await expect(service.provisionCognitoUser(input)).rejects.toThrow(
        CognitoProvisioningException,
      );

      expect(mockSecurityEventService.logCognitoProvisioningFailed).toHaveBeenCalledWith(
        'TENANT_A',
        '11111111-1111-1111-1111-111111111111',
        'admin@example.com',
        'MISSING_COGNITO_SUB',
        expect.stringContaining('missing required sub attribute'),
        1,
      );
    });
  });

  describe('US2: Idempotent Linking for Pre-Existing Accounts', () => {
    it('should intercept CognitoUserAlreadyExistsException, validate tenant ownership, and link externalIdentityId', async () => {
      const input = {
        userId: '22222222-2222-2222-2222-222222222222',
        email: 'existing@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser.mockRejectedValueOnce(
        new CognitoUserAlreadyExistsException('User already exists'),
      );

      mockCognitoService.getUser.mockResolvedValueOnce({
        username: 'existing@example.com',
        attributes: {
          sub: 'existing-cognito-sub-999',
          email: 'existing@example.com',
          'custom:tenant_code': 'TENANT_A',
        },
        enabled: true,
        userStatus: 'CONFIRMED',
      });

      const result = await service.provisionCognitoUser(input);

      expect(mockCognitoService.getUser).toHaveBeenCalledWith('existing@example.com');
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        '22222222-2222-2222-2222-222222222222',
        { externalIdentityId: 'existing-cognito-sub-999' },
      );
      expect(mockSecurityEventService.logCognitoUserProvisioned).toHaveBeenCalledWith(
        'TENANT_A',
        '22222222-2222-2222-2222-222222222222',
        'existing@example.com',
        'existing-cognito-sub-999',
        'LINKED_EXISTING',
      );
      expect(result.action).toBe('LINKED_EXISTING');
      expect(result.externalIdentityId).toBe('existing-cognito-sub-999');
    });

    it('should throw CognitoProvisioningException when existing user belongs to a different tenant', async () => {
      const input = {
        userId: '22222222-2222-2222-2222-222222222222',
        email: 'cross-tenant@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser.mockRejectedValueOnce(
        new CognitoUserAlreadyExistsException('User already exists'),
      );

      mockCognitoService.getUser.mockResolvedValueOnce({
        username: 'cross-tenant@example.com',
        attributes: {
          sub: 'existing-cognito-sub-999',
          email: 'cross-tenant@example.com',
          'custom:tenant_code': 'TENANT_B',
        },
        enabled: true,
        userStatus: 'CONFIRMED',
      });

      await expect(service.provisionCognitoUser(input)).rejects.toThrow(
        CognitoProvisioningException,
      );

      expect(mockSecurityEventService.logCognitoProvisioningFailed).toHaveBeenCalledWith(
        'TENANT_A',
        '22222222-2222-2222-2222-222222222222',
        'cross-tenant@example.com',
        'TENANT_MISMATCH',
        expect.stringContaining('different tenant: TENANT_B'),
        1,
      );
    });

    it('should throw CognitoProvisioningException when existing user sub is already linked to another internal user', async () => {
      const input = {
        userId: '22222222-2222-2222-2222-222222222222',
        email: 'collision@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser.mockRejectedValueOnce(
        new CognitoUserAlreadyExistsException('User already exists'),
      );

      mockCognitoService.getUser.mockResolvedValueOnce({
        username: 'collision@example.com',
        attributes: {
          sub: 'existing-cognito-sub-999',
          email: 'collision@example.com',
          'custom:tenant_code': 'TENANT_A',
        },
        enabled: true,
        userStatus: 'CONFIRMED',
      });

      mockUserRepository.findByTenantAndExternalIdentity.mockResolvedValueOnce({
        id: '33333333-3333-3333-3333-333333333333',
        tenantCode: 'TENANT_A',
      });

      await expect(service.provisionCognitoUser(input)).rejects.toThrow(
        CognitoProvisioningException,
      );

      expect(mockSecurityEventService.logCognitoProvisioningFailed).toHaveBeenCalledWith(
        'TENANT_A',
        '22222222-2222-2222-2222-222222222222',
        'collision@example.com',
        'IDENTITY_CONFLICT',
        expect.stringContaining('already linked to another internal user'),
        1,
      );
    });

    it('should throw CognitoProvisioningException when existing user record lacks sub', async () => {
      const input = {
        userId: '22222222-2222-2222-2222-222222222222',
        email: 'no-sub@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser.mockRejectedValueOnce(
        new CognitoUserAlreadyExistsException('User already exists'),
      );

      mockCognitoService.getUser.mockResolvedValueOnce({
        username: 'no-sub@example.com',
        attributes: {
          email: 'no-sub@example.com',
          'custom:tenant_code': 'TENANT_A',
        },
        enabled: true,
        userStatus: 'CONFIRMED',
      });

      await expect(service.provisionCognitoUser(input)).rejects.toThrow(
        CognitoProvisioningException,
      );

      expect(mockSecurityEventService.logCognitoProvisioningFailed).toHaveBeenCalledWith(
        'TENANT_A',
        '22222222-2222-2222-2222-222222222222',
        'no-sub@example.com',
        'MISSING_COGNITO_SUB',
        expect.stringContaining('missing required sub attribute'),
        1,
      );
    });
  });

  describe('US3: Resilient Failure Handling', () => {
    it('should retry transient errors with backoff and succeed if subsequent attempt succeeds', async () => {
      const input = {
        userId: '33333333-3333-3333-3333-333333333333',
        email: 'retry@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser
        .mockRejectedValueOnce(new CognitoInternalException('Internal AWS error'))
        .mockResolvedValueOnce({
          username: 'retry@example.com',
          attributes: { sub: 'recovered-sub' },
          enabled: true,
          userStatus: 'FORCE_CHANGE_PASSWORD',
        });

      const result = await service.provisionCognitoUser(input);

      expect(mockCognitoService.createUser).toHaveBeenCalledTimes(2);
      expect(result.externalIdentityId).toBe('recovered-sub');
      expect(mockSecurityEventService.logCognitoUserProvisioned).toHaveBeenCalledTimes(1);
    });

    it('should emit failure audit event and throw CognitoProvisioningException when retries are exhausted', async () => {
      const input = {
        userId: '44444444-4444-4444-4444-444444444444',
        email: 'fail@example.com',
        tenantCode: 'TENANT_A',
      };

      mockCognitoService.createUser.mockRejectedValue(
        new CognitoInternalException('Persistent connection failure'),
      );

      await expect(service.provisionCognitoUser(input)).rejects.toThrow(
        CognitoProvisioningException,
      );

      expect(mockSecurityEventService.logCognitoProvisioningFailed).toHaveBeenCalledWith(
        'TENANT_A',
        '44444444-4444-4444-4444-444444444444',
        'fail@example.com',
        'INTERNAL_ERROR',
        expect.stringContaining('Persistent connection failure'),
        3,
      );
    });
  });
});
