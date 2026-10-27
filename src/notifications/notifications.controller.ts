import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtCookieGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: UserSession,
    @Query('offset') offset = '0',
    @Query('limit') limit = '20',
  ) {
    return this.notificationsService.fetchNotificationByUser(
      user.id,
      Math.max(0, Number(offset) || 0),
      Math.min(100, Math.max(1, Number(limit) || 20)),
    );
  }

  @Get('mobile')
  listMobile(
    @CurrentUser() user: UserSession,
    @Query('offset') offset = '0',
    @Query('limit') limit = '20',
  ) {
    return this.notificationsService.fetchMobileNotificationByUser(
      user.id,
      Math.max(0, Number(offset) || 0),
      Math.min(100, Math.max(1, Number(limit) || 20)),
    );
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: UserSession) {
    return this.notificationsService.markAllReadByUser(user.id);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markReadNotificationByUser(user.id, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.deleteNotificationByUser(user.id, id);
  }
}
