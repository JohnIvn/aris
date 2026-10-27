import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';
import { SystemMonitoringService } from './system-monitoring.service';

@Controller('system')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class SystemMonitoringController {
  constructor(private readonly service: SystemMonitoringService) {}

  @Get('hardware/events')
  getHardwareEvents() {
    return this.service.getHardwareEvents();
  }

  @Get('monitoring')
  getSoftwareMonitoring(@Query('range') range?: string) {
    return this.service.getSoftwareMonitoring(range);
  }

  @Get('logs')
  getSystemLogs() {
    return this.service.getSystemLogs();
  }
}
