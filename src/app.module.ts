import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PayrollModule } from './payroll/payroll.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { ReportsModule } from './reports/reports.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MeetingsModule } from './meetings/meetings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfessorsModule } from './professors/professors.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuditModule } from './audit/audit.module';
import { StaffModule } from './staff/staff.module';
import { SystemMonitoringModule } from './system-monitoring/system-monitoring.module';
import { DatabaseManagementModule } from './database-management/database-management.module';
import { UserSettingsModule } from './user-settings/user-settings.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { SupportModule } from './support/support.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { ApprovalsModule } from './approvals/approvals.module';

@Module({
  imports: [
    AuthModule,
    DocumentsModule,
    RealtimeModule,
    PayrollModule,
    DatabaseModule,
    LoggerModule,
    ReportsModule,
    AnalyticsModule,
    MeetingsModule,
    NotificationsModule,
    ProfessorsModule,
    AnnouncementsModule,
    AuditModule,
    StaffModule,
    SystemMonitoringModule,
    DatabaseManagementModule,
    UserSettingsModule,
    SystemSettingsModule,
    SupportModule,
    CurriculumModule,
    ApprovalsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
