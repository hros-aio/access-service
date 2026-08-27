import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class LifecycleTransitionDto {
  @ApiProperty({
    description: 'Expected version token for optimistic concurrency control',
    example: 1,
  })
  @IsInt()
  version: number;
}
