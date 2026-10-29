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
import { getUserById } from '../lib/utils/helpers';
import { Dtr, DtrStatus } from '../lib/data/dtr.interface';

const SHIFT_STARTS_MIN = [8 * 60, 13 * 60];
const LATE_GRACE_MIN = 0;

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
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'create_report',
          user_id: user.id,
          role: user.role,
          metadata: { target_user_id: data.user_id },
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
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'update_report',
          user_id: user.id,
          role: user.role,
          metadata: { report_id: id },
        });
        return ErrorHandler(
          'Failed to update report, please try again later',
          500,
        );
      }

      await this.loggerService.logUserAction({
        action_status: 'success',
        action_type: 'update_report',
        user_id: user.id,
        role: user.role,
        metadata: { report_id: id },
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
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'delete_report',
          user_id: user.id,
          role: user.role,
          metadata: { report_id: id },
        });
        return ErrorHandler(
          'Failed to delete report, please try again later',
          500,
        );
      }

      await this.loggerService.logUserAction({
        action_status: 'success',
        action_type: 'delete_report',
        user_id: user.id,
        role: user.role,
        metadata: { report_id: id },
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
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'create_report_entry',
          user_id: user.id,
          role: user.role,
          metadata: { report_id: data.report_id },
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
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'update_report_entry',
          user_id: user.id,
          role: user.role,
          metadata: { report_entry_id: id },
        });
        return ErrorHandler(
          'Failed to update report entry, please try again later',
          500,
        );
      }

      await this.loggerService.logUserAction({
        action_status: 'success',
        action_type: 'update_report_entry',
        user_id: user.id,
        role: user.role,
        metadata: { report_entry_id: id },
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
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'delete_report_entry',
          user_id: user.id,
          role: user.role,
          metadata: { report_entry_id: id },
        });
        return ErrorHandler(
          'Failed to delete report entry, please try again later',
          500,
        );
      }

      await this.loggerService.logUserAction({
        action_status: 'success',
        action_type: 'delete_report_entry',
        user_id: user.id,
        role: user.role,
        metadata: { report_entry_id: id },
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

  async fetchReportsForMobile(
    user: UserSession,
    offset: number,
    limit: number,
  ) {
    try {
      const user_data = await getUserById(this.db, user.id);

      if (!user_data) {
        return ErrorHandler('Failed to fetch user data', 404);
      }

      const report_response = await this.db.query<ReportData>(
        `
      SELECT *
      FROM accomplishment_reports
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3
      `,
        [user.id, limit ?? 5, offset ?? 0],
      );

      const reports = report_response.rows;

      // One query for all entries of the fetched reports, grouped by report_id
      const entriesByReport = new Map<string, ReportEntryData[]>();

      if (reports.length > 0) {
        const entries_response = await this.db.query<ReportEntryData>(
          `
        SELECT *
        FROM report_entries
        WHERE report_id = ANY($1::uuid[])
        ORDER BY class_date ASC, shift_start ASC
        `,
          [reports.map((r) => r.id)],
        );

        for (const entry of entries_response.rows) {
          const list = entriesByReport.get(entry.report_id) ?? [];
          list.push(entry);
          entriesByReport.set(entry.report_id, list);
        }
      }

      const professorName = [
        user_data.firstname,
        user_data.middlename,
        user_data.lastname,
      ]
        .filter(Boolean)
        .join(' ');

      const formatted = await Promise.all(
        reports.map(async (report) => {
          const periodStart = new Date(report.period_start);
          const periodEnd = new Date(report.period_end);

          const periodLabel =
            `${periodStart.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ` +
            `${periodStart.getUTCDate().toString().padStart(2, '0')} - ` +
            `${periodEnd.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ` +
            `${periodEnd.getUTCDate().toString().padStart(2, '0')}`;

          const arTally = this.calculateARTally(
            entriesByReport.get(report.id) ?? [],
          );

          const [dtrTally, dtrEntries] = await Promise.all([
            this.calculateDTRTally(
              user.id,
              report.period_start,
              report.period_end,
            ),
            this.fetchDTREntries(
              user.id,
              report.period_start,
              report.period_end,
            ),
          ]);
          return {
            id: report.id,
            periodLabel,
            stage: report.approval_stage,
            updatedAt: report.updated_at,
            professorName,
            professorId: user_data.employee_id,
            department: user_data.department,
            position: user_data.position,
            faculty_no: report.faculty_no,
            remarks: report.remarks,
            arTally,
            dtrTally,
            dtrEntries,
            payroll_availability: report.payroll_availability,
            payroll_received: report.payroll_received,
          };
        }),
      );

      return SuccessHandler('Successfully Fetched Reports', 200, {
        reports: formatted,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }

      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async setPayrollReceived(report_id: string, user: UserSession) {
    try {
      const user_data = await getUserById(this.db, user.id);

      if (!user_data) {
        return ErrorHandler('Failed to fetch user data', 404);
      }

      const report_response = await this.db.query(
        `
      UPDATE accomplishment_reports
      SET payroll_received = TRUE, updated_at = NOW(), payroll_received_date = NOW()
      WHERE id = $1
        AND user_id = $2
      AND payroll_availability = TRUE`,
        [report_id, user.id],
      );

      if (report_response.rowCount === 0) {
        return ErrorHandler(
          'Report not found or payroll not yet available',
          404,
          'Not Found',
        );
      }

      return SuccessHandler('Payroll marked as received', 200, { report_id });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }

      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  private calculateARTally(entries: ReportEntryData[]) {
    return {
      entries,
      total: entries.length,
      total_hours: this.calculateARHrTally(entries),
    };
  }

  private async calculateDTRTally(
    user_id: string,
    periodStart: string,
    periodEnd: string,
  ) {
    try {
      const periodStartDate = new Date(periodStart);
      const periodEndDate = new Date(periodEnd);

      const response = await this.db.query(
        `SELECT *
        FROM dtr
        WHERE shift_date BETWEEN $1 AND $2
        AND (professor_id = $3 OR staff_id = $3)`,
        [periodStartDate, periodEndDate, user_id],
      );

      const dtrs = response.rows as Dtr[];

      if (!dtrs) {
        return ErrorHandler('No DTR Found in that date period', 404);
      }

      console.log('DTR Calculation: ', dtrs);

      const totalHrs = this.calculateDtrHrTally(dtrs);

      return totalHrs;
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }

      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  private calculateARHrTally(entries: ReportEntryData[]): number {
    let totalMinutes = 0;

    for (const entry of entries) {
      const [startHours, startMinutes] = entry.shift_start
        .split(':')
        .map(Number);

      const [endHours, endMinutes] = entry.shift_end.split(':').map(Number);

      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      let duration = endTotalMinutes - startTotalMinutes;

      if (duration < 0) {
        duration += 24 * 60;
      }

      totalMinutes += duration;
    }

    return Number((totalMinutes / 60).toFixed(2));
  }

  private calculateDtrHrTally(dtrs: Dtr[]): number {
    const totalMinutes = dtrs.reduce((total, dtr) => {
      const [startHours, startMinutes] = dtr.time_in.split(':').map(Number);

      const [endHours, endMinutes] = dtr.time_out.split(':').map(Number);

      const start = startHours * 60 + startMinutes;
      const end = endHours * 60 + endMinutes;

      let duration = end - start;

      // Support overnight shifts.
      if (duration < 0) {
        duration += 24 * 60;
      }

      return total + duration;
    }, 0);

    return Number((totalMinutes / 60).toFixed(2));
  }

  private async fetchDTREntries(
    userId: string,
    periodStart: string | Date,
    periodEnd: string | Date,
  ) {
    const res = await this.db.query<Dtr>(
      `
    SELECT id, time_in, time_out, total_hours, shift_date
    FROM dtr
    WHERE (professor_id = $1 OR staff_id = $1)
      AND shift_date BETWEEN $2::date AND $3::date
    ORDER BY shift_date ASC, time_in ASC
    `,
      [userId, periodStart, periodEnd],
    );

    return res.rows.map((row) => ({
      id: row.id,
      date: row.shift_date,
      time_in: row.time_in?.slice(0, 5) ?? null,
      time_out: row.time_out?.slice(0, 5) ?? null,
      total_hours: Number(row.total_hours ?? 0),
      status: this.dtrStatus(row.time_in, row.time_out),
    }));
  }

  private dtrStatus(timeIn: string | null, timeOut: string | null): DtrStatus {
    if (!timeIn || !timeOut) return 'missing';

    const [h, m] = timeIn.split(':').map(Number);
    const minutes = h * 60 + m;
    const start = SHIFT_STARTS_MIN.reduce((a, b) =>
      Math.abs(b - minutes) < Math.abs(a - minutes) ? b : a,
    );

    return minutes > start + LATE_GRACE_MIN ? 'late' : 'present';
  }
}
