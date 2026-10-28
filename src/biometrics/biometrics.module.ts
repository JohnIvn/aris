import { Module } from '@nestjs/common';
import { BiometricsService } from './biometrics.service';
import { BiometricsGateway } from './biometrics.gateway';
import { BiometricsController } from './biometrics.controller';
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [DatabaseModule, LoggerModule],
  controllers: [BiometricsController],
  providers: [BiometricsGateway, BiometricsService],
  exports: [BiometricsService],
})
export class BiometricsModule {}
