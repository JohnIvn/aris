import { Module } from '@nestjs/common';
import { BiometricsGateway } from './biometrics.gateway';
import { BiometricsService } from './biometrics.service';

@Module({
  providers: [BiometricsGateway, BiometricsService],
})
export class BiometricsModule {}
