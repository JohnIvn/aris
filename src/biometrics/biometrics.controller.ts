import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { BiometricsError, BiometricsService } from './biometrics.service';
import {
  ClearAuthenticatorDto,
  EnrollBiometricDto,
  PunchDto,
} from './dto/enroll-biometric.dto';
import { SuccessHandler } from '../lib/utils/handlers';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { type UserSession } from '../lib/data/interfaces';

interface AuthedRequest {
  user: { id: string; role: string };
}

@Controller('biometrics')
@UseGuards(JwtCookieGuard)
export class BiometricsController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @Get()
  getEnrolledBiometrics() {
    return this.biometricsService.getEnrolledBiometrics();
  }

  @Get('slots')
  getSlotSummary() {
    return this.biometricsService.getSlotSummary();
  }

  @Get('dtr')
  getDtrRecords(
    @Req() req: AuthedRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('missed') missed?: string,
  ) {
    return this.biometricsService.getDtrRecords(
      req.user,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(limit) || 20)),
      missed === 'true',
    );
  }

  @Post('enroll')
  enrollFingerprint(@Body() data: EnrollBiometricDto) {
    return this.biometricsService.enrollAuthenticatorFingerprint(data);
  }

  @Post('clear')
  clearAuthenticator(
    @Req() req: AuthedRequest,
    @Body() data: ClearAuthenticatorDto,
  ) {
    if (req.user.role !== 'administrator') {
      throw new ForbiddenException('Administrator access required');
    }
    return this.biometricsService.clearAuthenticator(data);
  }

  @Delete(':id')
  deleteBiometric(@Param('id') id: string) {
    return this.biometricsService.deleteBiometric(id);
  }

  @Post('punch')
  async punch(@Body() body: PunchDto) {
    try {
      const result = await this.biometricsService.punch(
        body.user_id,
        body.authenticator_tag,
      );
      return SuccessHandler('Punch recorded', 200, result);
    } catch (e) {
      if (e instanceof BiometricsError) {
        if (e.code === 'unknown_credential')
          throw new NotFoundException(e.message);
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(JwtCookieGuard)
  @Get('transactions')
  async getBiometricsTransactions(
    @CurrentUser() user: UserSession,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('emp_code') empCode?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.biometricsService.getBiometricsTransactions(
      user,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(limit) || 50)),
      empCode,
      startDate,
      endDate,
    );
  }
}
