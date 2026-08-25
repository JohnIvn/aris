import { Body, Controller, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import {
  ReportDeleteDto,
  ReportFetchDto,
  ReportFetchUserDto,
  ReportRecordDto,
  ReportUpdateDto,
  ReportEntryDeleteDto,
  ReportEntryFetchDto,
  ReportEntryFetchReportDto,
  ReportEntryRecordDto,
  ReportEntryUpdateDto,
} from './dto/reports.dto';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { type UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchReports(@Query() offset: number, @Query() limit: number) {
    return this.reportsService.fetchReports(offset, limit);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchReportByUser(
    @Query() offset: number,
    @Query() limit: number,
    @Body() data: ReportFetchUserDto,
  ) {
    return this.reportsService.fetchReportByUser(offset, limit, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchReportById(
    @Query() offset: number,
    @Query() limit: number,
    @Body() data: ReportFetchDto,
  ) {
    return this.reportsService.fetchReportById(offset, limit, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async recordReport(
    @CurrentUser() user: UserSession,
    @Body() data: ReportRecordDto,
  ) {
    return this.reportsService.recordReport(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async updateReport(
    @CurrentUser() user: UserSession,
    @Body() data: ReportUpdateDto,
  ) {
    return this.reportsService.updateReport(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async deleteReport(
    @CurrentUser() user: UserSession,
    @Body() data: ReportDeleteDto,
  ) {
    return this.reportsService.deleteReport(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchReportEntries(@Query() offset: number, @Query() limit: number) {
    return this.reportsService.fetchReportEntries(offset, limit);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchReportEntriesByReport(
    @Query() offset: number,
    @Query() limit: number,
    @Body() data: ReportEntryFetchReportDto,
  ) {
    return this.reportsService.fetchReportEntriesByReport(offset, limit, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async fetchReportEntryById(
    @Query() offset: number,
    @Query() limit: number,
    @Body() data: ReportEntryFetchDto,
  ) {
    return this.reportsService.fetchReportEntryById(offset, limit, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async recordReportEntry(
    @CurrentUser() user: UserSession,
    @Body() data: ReportEntryRecordDto,
  ) {
    return this.reportsService.recordReportEntry(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async updateReportEntry(
    @CurrentUser() user: UserSession,
    @Body() data: ReportEntryUpdateDto,
  ) {
    return this.reportsService.updateReportEntry(user, data);
  }

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  async deleteReportEntry(
    @CurrentUser() user: UserSession,
    @Body() data: ReportEntryDeleteDto,
  ) {
    return this.reportsService.deleteReportEntry(user, data);
  }
}
