import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ProfessorSubmissionsService } from './professor-submissions.service';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';

@Controller('professor')
export class ProfessorSubmissionsController {
  constructor(
    private readonly submissionsService: ProfessorSubmissionsService,
  ) {}

  @Get('submissions')
  getSubmissions(
    @CurrentUser() user?: UserSession,
    @Query('email') email?: string,
  ) {
    return this.submissionsService.getSubmissions(user, email);
  }

  @Get('submissions/latest')
  getLatestSubmission(
    @CurrentUser() user?: UserSession,
    @Query('email') email?: string,
  ) {
    return this.submissionsService.getLatestSubmission(user, email);
  }

  @Post('submissions')
  createSubmission(
    @Body() data: any,
    @CurrentUser() user?: UserSession,
  ) {
    return this.submissionsService.createSubmission(user, data);
  }

  @Get('dashboard')
  getDashboardOverview(
    @CurrentUser() user?: UserSession,
    @Query('email') email?: string,
  ) {
    return this.submissionsService.getDashboardOverview(user, email);
  }
}
