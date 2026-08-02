import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AdminInitiatePasswordResetDto {
  @ApiProperty({ description: 'Tenant code of the user', example: 'acme-corp' })
  @IsString()
  @IsNotEmpty()
  readonly tenantCode!: string;

  @ApiProperty({
    description: 'Target user UUID to initiate password reset for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  readonly userId!: string;
}
