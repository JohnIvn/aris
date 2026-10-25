import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserSettingsService } from './user-settings.service';

@Controller('users/me')
@UseGuards(JwtCookieGuard)
export class UserSettingsController {
  constructor(private readonly service: UserSettingsService) {}

  @Get('profile')
  profile(@CurrentUser() user: UserSession) {
    return this.service.getProfile(user);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: UserSession, @Body() data: Record<string, unknown>) {
    return this.service.updateProfile(user, data);
  }

  @Post('password')
  changePassword(@CurrentUser() user: UserSession, @Body() data: Record<string, unknown>) {
    return this.service.changePassword(user, data);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: UserSession) {
    return this.service.getPreferences(user);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: UserSession, @Body() data: Record<string, unknown>) {
    return this.service.updatePreferences(user, data);
  }

  @Post('photo')
  async uploadPhoto(
    @CurrentUser() user: UserSession,
    @Req() request: FastifyRequest,
  ) {
    const file = await request.file();
    if (!file) return this.service.invalid('A photo file is required');
    return this.service.savePhoto(user, file);
  }

  @Get('photo')
  async photo(
    @CurrentUser() user: UserSession,
    @Res() reply: FastifyReply,
  ) {
    return this.service.sendPhoto(user, reply);
  }
}
