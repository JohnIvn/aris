import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';
import { DatabaseManagementService } from './database-management.service';

@Controller('system/database')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class DatabaseManagementController {
  constructor(private readonly service: DatabaseManagementService) {}

  @Get('backups')
  listBackups() {
    return this.service.listBackups();
  }

  @Get('metrics')
  metrics() {
    return this.service.metrics();
  }

  @Post('backups')
  createBackup(@CurrentUser() user: UserSession) {
    return this.service.createBackup(user);
  }

  @Get('health-checks')
  healthChecks() {
    return this.service.healthChecks();
  }

  @Get('settings')
  settings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: UserSession,
    @Body() data: Record<string, unknown>,
  ) {
    return this.service.updateSettings(user, data);
  }

  @Get('restore-logs')
  restoreLogs() {
    return this.service.restoreLogs();
  }
}
