import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { Roles } from '../lib/decorators/roles.decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import {
  CreateAnnouncementDto,
  ListAnnouncementsDto,
  TogglePinAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcements.dto';
import { AnnouncementsService } from './announcements.service';

@Controller('announcements')
@UseGuards(JwtCookieGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  list(
    @CurrentUser() user: UserSession,
    @Query() filters: ListAnnouncementsDto,
  ) {
    return this.announcementsService.listAnnouncements(filters, user);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.announcementsService.getAnnouncement(id);
  }

  @Post()
  @Roles('admin')
  create(
    @CurrentUser() user: UserSession,
    @Body() data: CreateAnnouncementDto,
  ) {
    return this.announcementsService.createAnnouncement(user, data);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body() data: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.updateAnnouncement(id, data);
  }

  @Patch(':id/pin')
  @Roles('admin')
  togglePin(
    @Param('id') id: string,
    @Body() data: TogglePinAnnouncementDto,
  ) {
    return this.announcementsService.togglePin(id, data?.isPinned);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.announcementsService.deleteAnnouncement(id);
  }
}
