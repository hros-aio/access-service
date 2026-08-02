import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class VerifyChallengeDto {
  @IsUUID()
  @IsNotEmpty()
  public challengeId!: string;

  @IsString()
  @IsNotEmpty()
  public code!: string;
}
