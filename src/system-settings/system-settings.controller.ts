import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';
import { SystemSettingsService } from './system-settings.service';

@Controller('system/settings')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  update(@CurrentUser() user: UserSession, @Body() data: Record<string, unknown>) {
    return this.service.update(user, data);
  }
}
