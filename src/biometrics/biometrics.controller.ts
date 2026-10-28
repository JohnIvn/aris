import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { BiometricsService } from './biometrics.service';
import { EnrollBiometricDto } from './dto/enroll-biometric.dto';

@Controller('biometrics')
@UseGuards(JwtCookieGuard)
export class BiometricsController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @Get()
  getEnrolledBiometrics() {
    return this.biometricsService.getEnrolledBiometrics();
  }

  @Get('slots')
  getSlotsSummary() {
    return this.biometricsService.getSlotsSummary();
  }

  @Post('enroll')
  enrollFingerprint(@Body() data: EnrollBiometricDto) {
    return this.biometricsService.enrollFingerprint(data);
  }

  @Delete(':id')
  deleteBiometric(@Param('id') id: string) {
    return this.biometricsService.deleteBiometric(id);
  }
}

