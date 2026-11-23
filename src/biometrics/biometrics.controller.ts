import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import {
  ClearAuthenticatorDto,
  EnrollBiometricDto,
} from './dto/enroll-biometric.dto';
import { AssignBiometricsDto } from './dto/assign-biometrics.dto';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { Roles } from '../lib/decorators/roles.decorator';
import { type UserSession } from '../lib/data/interfaces';
import { BiometricsService } from './biometrics.service';

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

  // ZKTeco: biometrics ids that exist but are not linked to any professor/staff yet
  @Roles('admin')
  @Get('unassigned')
  getUnassignedBiometrics() {
    return this.biometricsService.getUnassignedBiometrics();
  }

  // ZKTeco: link a biometrics_emp_id to a professor/staff
  @Roles('admin')
  @Post('assign')
  assignBiometricsToUser(@Body() data: AssignBiometricsDto) {
    return this.biometricsService.assignBiometricsToUser(data);
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
