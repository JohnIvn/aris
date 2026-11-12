import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';
import { OTAService } from './ota.service';

@Controller('system/ota')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class OTAController {
  constructor(private readonly service: OTAService) {}

  @Get('files')
  listFiles() {
    return this.service.listFiles();
  }

  @Get('main')
  getMainFile() {
    return this.service.getMainFile();
  }

  @Post('files')
  async uploadFile(
    @CurrentUser() user: UserSession,
    @Req() request: FastifyRequest,
  ) {
    const file = await request.file();
    if (!file) return this.service.invalid('A PowerShell file is required');
    return this.service.uploadFile(user, file);
  }

  @Post('main')
  setMainFile(
    @CurrentUser() user: UserSession,
    @Body() data: { name?: string },
  ) {
    return this.service.setMainFile(user, data.name);
  }
}
