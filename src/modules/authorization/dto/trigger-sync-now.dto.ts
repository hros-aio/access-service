import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

import { SyncSourceType } from '../entities/authorization-sync-job.entity';

export class TriggerSyncNowDto {
  @ApiProperty({
    description: 'Type of entity to synchronize',
    enum: SyncSourceType,
    example: SyncSourceType.USER_GROUP,
  })
  @IsNotEmpty()
  @IsEnum(SyncSourceType)
  readonly sourceType: SyncSourceType;

  @ApiProperty({
    description: 'Target entity unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsUUID()
  readonly sourceId: string;
}
