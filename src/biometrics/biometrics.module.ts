import { Module } from '@nestjs/common';
import { BiometricsService } from './biometrics.service';
// import { BiometricsGateway } from './biometrics.gateway';
import { BiometricsController } from './biometrics.controller';
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../logger/logger.module';
import { BiometricsHardwareController } from './biometrics-hardware.controller';

@Module({
  imports: [DatabaseModule, LoggerModule],
  controllers: [BiometricsController, BiometricsHardwareController],
  providers: [BiometricsService],
  exports: [BiometricsService],
})
export class BiometricsModule {}
