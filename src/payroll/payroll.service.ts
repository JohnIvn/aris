import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  PayrollDeleteDto,
  PayrollFetchDto,
  PayrollFetchUserDto,
  PayrollRecordDto,
  PayrollUpdateDto,
} from './dto/payroll.dto';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { PayrollData } from '../lib/data/payroll.interface';
import { UserSession } from '../lib/data/interfaces';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async fetchPayrolls(offset: number, limit: number) {
    try {
      const response = await this.db.query<{
        id: string;
        name: string;
        employee_id: string;
        type: string;
        period: string;
        units: number;
        status: string;
      }>(
        `SELECT
           s.id,
           COALESCE(u.firstname || ' ' || u.lastname, 'Unknown employee') AS name,
           r.employee_id,
           COALESCE(s.record_type, 'AR') AS type,
           TO_CHAR(r.period_start, 'Mon DD') || ' - ' ||
             TO_CHAR(r.period_end, 'Mon DD, YYYY') AS period,
           COALESCE(cardinality(r.entries), 0)::int AS units,
           s.status::text AS status
         FROM submissions s
         JOIN accomplishment_reports r ON r.id = s.report_id
         LEFT JOIN LATERAL (
           SELECT firstname, lastname FROM user_professors WHERE id = s.user_id
           UNION ALL
           SELECT firstname, lastname FROM user_staffs WHERE id = s.user_id
         ) u ON TRUE
         ORDER BY s.submitted_at DESC
         OFFSET $1 LIMIT $2`,
        [offset ?? 0, limit ?? 100],
      );

      const records = response.rows.map((row) => {
        const status =
          row.status === 'approved'
            ? 'Approved'
            : row.status === 'rejected' || row.status === 'disapproved'
              ? 'Rejected'
              : 'Pending';
        const unitsLabel = `${row.units} ${row.type === 'DTR' ? 'days' : 'outputs'}`;
        return {
          id: row.id,
          name: row.name,
          employeeId: row.employee_id,
          type: row.type,
          period: row.period,
          units: unitsLabel,
          rate: '₱0',
          amount: '₱0',
          status,
        };
      });
      const counts = records.reduce(
        (result, record) => {
          result[record.status] += 1;
          return result;
        },
        { Approved: 0, Pending: 0, Rejected: 0 },
      );
      const total = records.length || 1;
      const classes = [
        {
          label: 'Accepted',
          note: `${counts.Approved} records`,
          value: '₱0',
          pct: Math.round((counts.Approved / total) * 100),
          color: '#4a9d62',
        },
        {
          label: 'Pending',
          note: `${counts.Pending} records`,
          value: '₱0',
          pct: Math.round((counts.Pending / total) * 100),
          color: '#e0a63a',
        },
        {
          label: 'Rejected',
          note: `${counts.Rejected} records`,
          value: '₱0',
          pct: Math.round((counts.Rejected / total) * 100),
          color: '#d0674a',
        },
      ];
      return SuccessHandler('Successfully Fetched Payroll Records', 200, {
        records,
        classes,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchPayrollById(offset: number, limit: number, data: PayrollFetchDto) {
    try {
      const { id } = data;

      const response = await this.db.query<PayrollData>(
        `SELECT * FROM payroll
          WHERE id = $1
          OFFSET $2 LIMIT $3`,
        [id, offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch payroll, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Recorded Payroll', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchPayrollByUser(
    offset: number,
    limit: number,
    data: PayrollFetchUserDto,
  ) {
    try {
      const { user_id } = data;

      const response = await this.db.query<PayrollData>(
        `SELECT * FROM payroll
          WHERE user_id = $1
          OFFSET $2 LIMIT $3`,
        [user_id, offset ?? 0, limit ?? 20],
      );

      if (response.rowCount === 0) {
        return ErrorHandler(
          'Failed to fetch payroll, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Recorded Payroll', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async recordPayroll(user: UserSession, data: PayrollRecordDto) {
    try {
      const { user_id, employee_id, salary, date_received } = data;

      const response = await this.db.query<PayrollData>(
        `INSERT INTO payroll (user_id, employee_id, salary, date_received)
            VALUES ($1, $2, $3, $4)`,
        [user_id, employee_id, salary, date_received],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'create_payroll',
          user_id: user.id,
          role: user.role,
          metadata: { target_user_id: data.user_id },
        });
        return ErrorHandler(
          'Failed to record payroll, please try again later',
          500,
        );
      }

      return SuccessHandler('Successfully Recorded Payroll', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async updatePayroll(user: UserSession, data: PayrollUpdateDto) {
    try {
      const { id, salary, date_received } = data;

      const response = await this.db.query<{ id: string }>(
        `UPDATE payroll
            SET 
                salary = COALESCE($1, salary),
                date_received = COALESCE($2, date_received)
            WHERE id = $3
            RETURNING id`,
        [salary, date_received, id],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'update_payroll',
          user_id: user.id,
          role: user.role,
          metadata: { payroll_id: id },
        });
        return ErrorHandler(
          'Failed to update payroll, please try again later',
          500,
        );
      }

      await this.loggerService.logUserAction({
        action_status: 'success',
        action_type: 'update_payroll',
        user_id: user.id,
        role: user.role,
        metadata: { payroll_id: id },
      });

      return SuccessHandler('Successfully Recorded Payroll', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async deletePayroll(user: UserSession, data: PayrollDeleteDto) {
    try {
      const { id } = data;

      const response = await this.db.query<{ id: string }>(
        `DELETE FROM payroll
            WHERE id = $1
            RETURNING id`,
        [id],
      );

      if (response.rowCount === 0) {
        await this.loggerService.logUserAction({
          action_status: 'failure',
          action_type: 'delete_payroll',
          user_id: user.id,
          role: user.role,
          metadata: { payroll_id: id },
        });
        return ErrorHandler(
          'Failed to delete payroll, please try again later',
          500,
        );
      }

      await this.loggerService.logUserAction({
        action_status: 'success',
        action_type: 'delete_payroll',
        user_id: user.id,
        role: user.role,
        metadata: { payroll_id: id },
      });

      return SuccessHandler('Successfully Recorded Payroll', 200, { response });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
