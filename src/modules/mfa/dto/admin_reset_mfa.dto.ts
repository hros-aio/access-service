import { IsNotEmpty, IsUUID } from 'class-validator';

export class AdminResetMfaDto {
  @IsUUID()
  @IsNotEmpty()
  public targetUserId!: string;
}
