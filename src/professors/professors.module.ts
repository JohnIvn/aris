import { Module } from '@nestjs/common';
import { ProfessorsController } from './professors.controller';
import { ProfessorsService } from './professors.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProfessorsController],
  providers: [ProfessorsService],
})
export class ProfessorsModule {}
