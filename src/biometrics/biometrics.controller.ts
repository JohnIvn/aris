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
import { TransactionsDto } from './dto/biometrics-transactions.dto';

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

  @Get('dtr')
  getDtrRecords(@Req() req: AuthedRequest) {
    return this.biometricsService.getDtrRecords(req.user);
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

  @Post('transactions')
  async recordTransactions(@Body() body: TransactionsDto) {
    return this.biometricsService.recordTransactions(body);
  }
}
