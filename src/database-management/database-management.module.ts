import { Module } from '@nestjs/common';
import { DatabaseManagementController } from './database-management.controller';
import { DatabaseManagementService } from './database-management.service';

@Module({
  controllers: [DatabaseManagementController],
  providers: [DatabaseManagementService],
})
export class DatabaseManagementModule {}
