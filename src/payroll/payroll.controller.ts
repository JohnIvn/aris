import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import {
  PayrollDeleteDto,
  PayrollFetchDto,
  PayrollFetchUserDto,
  PayrollRecordDto,
  PayrollUpdateDto,
} from './dto/payroll.dto';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { type UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  @Get()
  async fetchPayrolls(
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.payrollService.fetchPayrolls(offset, limit);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchPayrollByUser(
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Body() data: PayrollFetchUserDto,
  ) {
    return this.payrollService.fetchPayrollByUser(offset, limit, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchPayrollById(
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Body() data: PayrollFetchDto,
  ) {
    return this.payrollService.fetchPayrollById(offset, limit, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async recordPayroll(
    @CurrentUser() user: UserSession,
    @Body() data: PayrollRecordDto,
  ) {
    return this.payrollService.recordPayroll(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async updatePayroll(
    @CurrentUser() user: UserSession,
    @Body() data: PayrollUpdateDto,
  ) {
    return this.payrollService.updatePayroll(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async deletePayroll(
    @CurrentUser() user: UserSession,
    @Body() data: PayrollDeleteDto,
  ) {
    return this.payrollService.deletePayroll(user, data);
  }
}
