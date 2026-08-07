import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

@Module({
  controllers: [],
  providers: [RealtimeService],
})
export class RealtimeModule {}
