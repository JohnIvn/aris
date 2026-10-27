import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SystemMonitoringController } from './system-monitoring.controller';
import { SystemMonitoringService } from './system-monitoring.service';
import { MetricsCollectorService } from './metrics-collector.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Global()
@Module({
  controllers: [SystemMonitoringController],
  providers: [
    SystemMonitoringService,
    MetricsCollectorService,
    HttpMetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [SystemMonitoringService, MetricsCollectorService, HttpMetricsInterceptor],
})
export class SystemMonitoringModule {}
