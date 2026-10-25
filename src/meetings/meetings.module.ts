import { Module } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import {
  MeetingsController,
  ProfessorSummariesController,
} from './meetings.controller';

@Module({
  controllers: [MeetingsController, ProfessorSummariesController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
