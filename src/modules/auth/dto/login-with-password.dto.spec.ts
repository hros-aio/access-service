import { validate } from 'class-validator';

import { LoginWithPasswordDto } from './login-with-password.dto';

describe('LoginWithPasswordDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = new LoginWithPasswordDto();
    dto.tenantCode = 'TENANT_123';
    dto.email = 'employee@tenant.com';
    dto.password = 'SecurePassword123!';
    dto.rememberMe = true;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation with invalid email format', async () => {
    const dto = new LoginWithPasswordDto();
    dto.tenantCode = 'TENANT_123';
    dto.email = 'invalid-email';
    dto.password = 'SecurePassword123!';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('email');
  });

  it('should fail validation with empty values', async () => {
    const dto = new LoginWithPasswordDto();
    dto.tenantCode = '';
    dto.email = '';
    dto.password = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
