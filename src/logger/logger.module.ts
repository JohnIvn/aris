import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

@Global()
@Module({
  controllers: [],
  providers: [LoggerService],
})
export class LoggerModule {}
