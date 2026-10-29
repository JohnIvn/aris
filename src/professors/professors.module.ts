import { Module } from '@nestjs/common';
import { ProfessorsController } from './professors.controller';
import { ProfessorSubmissionsController } from './professor-submissions.controller';
import { ProfessorsService } from './professors.service';
import { ProfessorSubmissionsService } from './professor-submissions.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../logger/logger.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, DatabaseModule, LoggerModule, AuditModule],
  controllers: [ProfessorsController, ProfessorSubmissionsController],
  providers: [ProfessorsService, ProfessorSubmissionsService],
  exports: [ProfessorsService, ProfessorSubmissionsService],
})
export class ProfessorsModule {}
