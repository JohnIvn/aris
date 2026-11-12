import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { HardwareTokenGuard } from '../lib/guards/hardware-token.guard';
import { BiometricsService } from './biometrics.service';
import { TransactionsDto } from './dto/biometrics-transactions.dto';

@Controller('biometrics')
@UseGuards(HardwareTokenGuard)
export class BiometricsHardwareController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @Post('transactions')
  async recordTransactions(@Body() body: TransactionsDto) {
    return this.biometricsService.recordTransactions(body);
  }
}
