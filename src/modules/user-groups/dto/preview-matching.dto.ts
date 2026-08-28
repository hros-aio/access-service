import { ApiProperty } from '@nestjs/swagger';

export class MatchedMemberDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee Code' })
  employeeCode: string;

  @ApiProperty({ description: 'Department ID', nullable: true })
  departmentId?: string | null;

  @ApiProperty({ description: 'Location ID', nullable: true })
  locationId?: string | null;

  @ApiProperty({ description: 'Employment Status' })
  employmentStatus: string;

  @ApiProperty({ description: 'Reportees Count' })
  reporteesCount: number;

  @ApiProperty({ description: 'Matched timestamp' })
  matchedAt?: Date;
}

export class PreviewMatchingResponseDto {
  @ApiProperty({ description: 'Total number of employees matching draft criteria' })
  matchedCount: number;

  @ApiProperty({ description: 'Sample list of matching employees', type: [MatchedMemberDto] })
  sampleEmployees: MatchedMemberDto[];
}
