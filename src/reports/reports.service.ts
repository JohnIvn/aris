import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
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
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { ReportData, ReportEntryData } from '../lib/data/reports.interface';
import { UserSession } from '../lib/data/interfaces';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async fetchReports(offset: number, limit: number) {
    try {
      const response = await this.db.query<ReportData>(
        `SELECT * FROM accomplishment_reports
          OFFSET $1 LIMIT $2`,
        [offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch reports, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Fetched Reports', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchReportById(offset: number, limit: number, data: ReportFetchDto) {
    try {
      const { id } = data;

      const response = await this.db.query<ReportData>(
        `SELECT * FROM accomplishment_reports
          WHERE id = $1
          OFFSET $2 LIMIT $3`,
        [id, offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch report, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Fetched Report', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchReportByUser(
    offset: number,
    limit: number,
    data: ReportFetchUserDto,
  ) {
    try {
      const { user_id } = data;

      const response = await this.db.query<ReportData>(
        `SELECT * FROM accomplishment_reports
          WHERE user_id = $1
          OFFSET $2 LIMIT $3`,
        [user_id, offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch reports, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Fetched Reports', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async recordReport(user: UserSession, data: ReportRecordDto) {
    try {
      const { user_id, employee_id, shift_hours, shift_start, shift_end } =
        data;

      const response = await this.db.query<ReportData>(
        `INSERT INTO accomplishment_reports (user_id, employee_id, shift_hours, shift_start, shift_end)
            VALUES ($1, $2, $3, $4, $5)`,
        [user_id, employee_id, shift_hours, shift_start, shift_end],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'create_report',
          admin_id: user.id,
          user_id: data.user_id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to record report, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Recorded Report', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async updateReport(user: UserSession, data: ReportUpdateDto) {
    try {
      const { id, shift_hours, shift_start, shift_end } = data;

      const response = await this.db.query<{ id: string }>(
        `UPDATE accomplishment_reports
            SET 
                shift_hours = COALESCE($1, shift_hours),
                shift_start = COALESCE($2, shift_start),
                shift_end = COALESCE($3, shift_end)
            WHERE id = $4
            RETURNING id`,
        [shift_hours, shift_start, shift_end, id],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'update_report',
          admin_id: user.id,
          user_id: id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to update report, please try again later',
          500,
        );
      }

      await this.loggerService.logAdminAction({
        action_status: 'success',
        action_type: 'update_report',
        admin_id: user.id,
        user_id: id,
        metadata: {},
      });

      return SuccessHandler('Successfully Updated Report', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async deleteReport(user: UserSession, data: ReportDeleteDto) {
    try {
      const { id } = data;

      const response = await this.db.query<{ id: string }>(
        `DELETE FROM accomplishment_reports
            WHERE id = $1
            RETURNING id`,
        [id],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'delete_report',
          admin_id: user.id,
          user_id: id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to delete report, please try again later',
          500,
        );
      }

      await this.loggerService.logAdminAction({
        action_status: 'success',
        action_type: 'delete_report',
        admin_id: user.id,
        user_id: id,
        metadata: {},
      });

      return SuccessHandler('Successfully Deleted Report', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchReportEntries(offset: number, limit: number) {
    try {
      const response = await this.db.query<ReportEntryData>(
        `SELECT * FROM report_entries
          OFFSET $1 LIMIT $2`,
        [offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch report entries, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Fetched Report Entries', 200, {
        response,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchReportEntryById(
    offset: number,
    limit: number,
    data: ReportEntryFetchDto,
  ) {
    try {
      const { id } = data;

      const response = await this.db.query<ReportEntryData>(
        `SELECT * FROM report_entries
          WHERE id = $1
          OFFSET $2 LIMIT $3`,
        [id, offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch report entry, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Fetched Report Entry', 200, {
        response,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchReportEntriesByReport(
    offset: number,
    limit: number,
    data: ReportEntryFetchReportDto,
  ) {
    try {
      const { report_id } = data;

      const response = await this.db.query<ReportEntryData>(
        `SELECT * FROM report_entries
          WHERE report_id = $1
          OFFSET $2 LIMIT $3`,
        [report_id, offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch report entries, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Fetched Report Entries', 200, {
        response,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async recordReportEntry(user: UserSession, data: ReportEntryRecordDto) {
    try {
      const { report_id, course, description, output_count, status } = data;

      const response = await this.db.query<ReportEntryData>(
        `INSERT INTO report_entries (report_id, course, description, output_count, status)
            VALUES ($1, $2, $3, $4, COALESCE($5, 'draft'))`,
        [report_id, course, description, output_count, status],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'create_report_entry',
          admin_id: user.id,
          user_id: data.report_id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to record report entry, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Recorded Report Entry', 200, {
        response,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async updateReportEntry(user: UserSession, data: ReportEntryUpdateDto) {
    try {
      const { id, course, description, output_count, status } = data;

      const response = await this.db.query<{ id: string }>(
        `UPDATE report_entries
            SET 
                course = COALESCE($1, course),
                description = COALESCE($2, description),
                output_count = COALESCE($3, output_count),
                status = COALESCE($4, status)
            WHERE id = $5
            RETURNING id`,
        [course, description, output_count, status, id],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'update_report_entry',
          admin_id: user.id,
          user_id: id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to update report entry, please try again later',
          500,
        );
      }

      await this.loggerService.logAdminAction({
        action_status: 'success',
        action_type: 'update_report_entry',
        admin_id: user.id,
        user_id: id,
        metadata: {},
      });

      return SuccessHandler('Successfully Updated Report Entry', 200, {
        response,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async deleteReportEntry(user: UserSession, data: ReportEntryDeleteDto) {
    try {
      const { id } = data;

      const response = await this.db.query<{ id: string }>(
        `DELETE FROM report_entries
            WHERE id = $1
            RETURNING id`,
        [id],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'delete_report_entry',
          admin_id: user.id,
          user_id: id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to delete report entry, please try again later',
          500,
        );
      }

      await this.loggerService.logAdminAction({
        action_status: 'success',
        action_type: 'delete_report_entry',
        admin_id: user.id,
        user_id: id,
        metadata: {},
      });

      return SuccessHandler('Successfully Deleted Report Entry', 200, {
        response,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
