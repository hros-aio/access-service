import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmployeeReference } from './entities/employee-reference.entity';
import { EmployeeReferenceRepository } from './repositories/employee-reference.repository';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeReference])],
  providers: [EmployeeReferenceRepository],
  exports: [EmployeeReferenceRepository],
})
export class EmployeeModule {}
