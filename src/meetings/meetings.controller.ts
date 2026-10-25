import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { SaveMeetingDto } from './dto/meetings.dto';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';

@Controller('meetings')
@UseGuards(JwtCookieGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get()
  async getMeetings(
    @CurrentUser() user: UserSession,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.meetingsService.fetchMeetings(user, offset, limit);
  }

  @Get('summaries')
  async getSummaries(
    @CurrentUser() user: UserSession,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.meetingsService.fetchSummaries(user, offset, limit);
  }

  @Post()
  async saveMeeting(
    @CurrentUser() user: UserSession,
    @Body() dto: SaveMeetingDto,
  ) {
    return this.meetingsService.saveMeeting(user, dto);
  }

  @Post('end')
  async endMeeting(
    @CurrentUser() user: UserSession,
    @Body() dto: SaveMeetingDto,
  ) {
    return this.meetingsService.saveMeeting(user, dto);
  }

  @Delete(':id')
  async deleteMeeting(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
  ) {
    return this.meetingsService.deleteMeeting(user, id);
  }
}

@Controller('professor')
@UseGuards(JwtCookieGuard)
export class ProfessorSummariesController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get('meeting-summaries')
  async getMeetingSummaries(
    @CurrentUser() user: UserSession,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.meetingsService.fetchSummaries(user, offset, limit);
  }
}
