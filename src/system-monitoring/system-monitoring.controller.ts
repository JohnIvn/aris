import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { exec } from 'child_process';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';
import { SystemMonitoringService } from './system-monitoring.service';

@Controller('system')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class SystemMonitoringController {
  constructor(private readonly service: SystemMonitoringService) {}

  @Get('provisioner/status')
  getProvisionerStatus(): Promise<{ running: boolean; pid: number | null }> {
    return new Promise((resolve) => {
      // Look for powershell processes running the ArisProvisioner script
      exec(
        `powershell -NoProfile -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*ArisProvisioner*' } | Select-Object -First 1 ProcessId | ConvertTo-Json"`,
        { timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve({ running: false, pid: null });
            return;
          }
          try {
            const parsed = JSON.parse(stdout.trim()) as { ProcessId?: number };
            const pid = parsed?.ProcessId ?? null;
            resolve({ running: pid != null, pid });
          } catch {
            resolve({ running: false, pid: null });
          }
        },
      );
    });
  }

  @Get('hardware/status')
  getDeviceStatus() {
    return this.service.getDeviceStatus();
  }

  @Post('hardware/ping')
  recordDevicePing(
    @Body()
    body: {
      deviceId?: string;
      firmwareVersion?: string;
      ip?: string;
    },
  ) {
    return this.service.recordDevicePing(body);
  }

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
