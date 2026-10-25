import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { Roles } from '../lib/decorators/roles.decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import {
  CreateAnnouncementDto,
  ListAnnouncementsDto,
} from './dto/announcements.dto';
import { AnnouncementsService } from './announcements.service';

@Controller('announcements')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  list(@Query() filters: ListAnnouncementsDto) {
    return this.announcementsService.listAnnouncements(filters);
  }

  @Post()
  create(
    @CurrentUser() user: UserSession,
    @Body() data: CreateAnnouncementDto,
  ) {
    return this.announcementsService.createAnnouncement(user, data);
  }
}
