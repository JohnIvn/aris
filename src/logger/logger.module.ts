import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { LoggerController } from './logger.controller';

@Global()
@Module({
  controllers: [LoggerController],
  providers: [LoggerService],
})
export class LoggerModule {}
