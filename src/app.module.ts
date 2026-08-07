import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PayrollModule } from './payroll/payroll.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    AuthModule,
    DocumentsModule,
    RealtimeModule,
    PayrollModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
