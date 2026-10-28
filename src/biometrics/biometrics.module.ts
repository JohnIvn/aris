import { Module } from '@nestjs/common';
import { BiometricsService } from './biometrics.service';
import { BiometricsGateway } from './biometrics.gateway';

@Module({
  providers: [BiometricsGateway, BiometricsService],
})
export class BiometricsModule {}
