import { Module } from '@nestjs/common';
import { OTAController } from './ota.controller';
import { OTAService } from './ota.service';

@Module({
  controllers: [OTAController],
  providers: [OTAService],
})
export class OTAModule {}
