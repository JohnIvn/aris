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
      // 1. Fetch official recorded payroll from `payroll` table
      const payrollRes = await this.db.query<{
        id: string;
        name: string;
        employee_id: string;
        type: string;
        period: string;
        units: string;
        hours: number;
        rate: number;
        salary: number;
        amount: number;
        status: string;
        report_id: string | null;
        submission_id: string | null;
        created_at: Date;
      }>(
        `SELECT
           p.id,
           COALESCE(up.firstname || ' ' || up.lastname, us.firstname || ' ' || us.lastname, 'Faculty ' || COALESCE(p.employee_id, '')) AS name,
           p.employee_id,
           COALESCE(p.type, 'AR') AS type,
           COALESCE(p.period, 'September Cycle 1') AS period,
           p.units,
           COALESCE(p.hours, 0)::numeric AS hours,
           COALESCE(p.rate, 500)::numeric AS rate,
           COALESCE(p.amount, p.salary, 0)::numeric AS amount,
           COALESCE(p.salary, p.amount, 0)::numeric AS salary,
           COALESCE(p.status, 'Approved') AS status,
           p.report_id,
           p.submission_id,
           p.created_at
         FROM payroll p
         LEFT JOIN user_professors up ON up.id = p.professor_id OR up.id = p.user_id OR up.employee_id = p.employee_id
         LEFT JOIN user_staffs us ON us.id = p.user_id OR us.employee_id = p.employee_id
         ORDER BY p.updated_at DESC, p.created_at DESC`,
      );

      const recordedReportIds = new Set(
        payrollRes.rows.map((r) => r.report_id).filter(Boolean),
      );

      const allRecords: Array<{
        id: string;
        name: string;
        employeeId: string;
        type: 'AR' | 'DTR';
        period: string;
        units: string;
        rate: number;
        amount: number;
        status: 'Approved' | 'Pending' | 'Rejected';
      }> = [];

      for (const row of payrollRes.rows) {
        const status =
          row.status === 'Approved' || row.status === 'approved'
            ? 'Approved'
            : row.status === 'Rejected' || row.status === 'rejected' || row.status === 'disapproved'
              ? 'Rejected'
              : 'Pending';
        const numRate = Number(row.rate) || 500;
        const numAmount = Number(row.amount || row.salary) || (Number(row.hours) * numRate) || 0;
        allRecords.push({
          id: row.id,
          name: row.name,
          employeeId: row.employee_id,
          type: (row.type as 'AR' | 'DTR') || 'AR',
          period: row.period,
          units: row.units || `${Number(row.hours || 0).toFixed(1)} hrs`,
          rate: numRate,
          amount: numAmount,
          status,
        });
      }

      // 2. Fetch unrecorded accomplishment reports
      const arRes = await this.db.query<{
        id: string;
        name: string;
        employee_id: string;
        period_start: Date | null;
        period_end: Date | null;
        entry_count: number;
        calculated_hours: number;
        approval_stage: string;
        remarks: string | null;
        payroll_availability: boolean;
        created_at: Date;
      }>(
        `SELECT
           ar.id,
           COALESCE(up.firstname || ' ' || up.lastname, us.firstname || ' ' || us.lastname, 'Faculty ' || COALESCE(ar.faculty_no, '')) AS name,
           COALESCE(ar.employee_id, up.employee_id, ar.faculty_no) AS employee_id,
           ar.period_start,
           ar.period_end,
           COALESCE((SELECT COUNT(*)::int FROM report_entries re WHERE re.report_id = ar.id), 0) AS entry_count,
           COALESCE(
             (SELECT SUM(
               CASE
                 WHEN re.shift_hours IS NOT NULL AND re.shift_hours::numeric > 0 THEN re.shift_hours::numeric
                 WHEN re.units IS NOT NULL AND re.units > 0 THEN re.units::numeric
                 ELSE 3
               END
             ) FROM report_entries re WHERE re.report_id = ar.id),
             30
           )::numeric AS calculated_hours,
           ar.approval_stage,
           ar.remarks,
           ar.payroll_availability,
           ar.created_at
         FROM accomplishment_reports ar
         LEFT JOIN user_professors up ON up.id = ar.user_id OR up.employee_id = ar.employee_id
         LEFT JOIN user_staffs us ON us.id = ar.user_id OR us.employee_id = ar.employee_id
         ORDER BY ar.created_at DESC`,
      );

      for (const ar of arRes.rows) {
        if (recordedReportIds.has(ar.id)) continue;

        let status: 'Approved' | 'Pending' | 'Rejected' = 'Pending';
        if (ar.payroll_availability || ar.approval_stage === 'AR-AP-STG-4') {
          status = 'Approved';
        } else if (ar.remarks && /reject|disapprov/i.test(ar.remarks) && !/resubmit/i.test(ar.remarks)) {
          status = 'Rejected';
        }

        const hours = Number(ar.calculated_hours) || 30;
        const rate = 500;
        const amount = Math.round(hours * rate);
        const period =
          ar.period_start && ar.period_end
            ? `${new Date(ar.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(ar.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'September Cycle 1';
        const units = `${ar.entry_count} outputs (${hours.toFixed(1)} hrs)`;

        allRecords.push({
          id: ar.id,
          name: ar.name,
          employeeId: ar.employee_id,
          type: 'AR',
          period,
          units,
          rate,
          amount,
          status,
        });
      }

      // 3. Check for any DTR logs if none in payroll
      const hasDtr = allRecords.some((r) => r.type === 'DTR');
      if (!hasDtr) {
        const dtrRes = await this.db.query<{
          professor_id: string;
          name: string;
          employee_id: string;
          days_logged: number;
          total_hours: number;
          min_date: Date | null;
          max_date: Date | null;
        }>(
          `SELECT
             d.professor_id,
             COALESCE(up.firstname || ' ' || up.lastname, 'Faculty') AS name,
             COALESCE(up.employee_id, 'P0001') AS employee_id,
             COUNT(*)::int AS days_logged,
             SUM(COALESCE(d.total_hours::numeric, 8))::numeric AS total_hours,
             MIN(d.shift_date) AS min_date,
             MAX(d.shift_date) AS max_date
           FROM dtr d
           LEFT JOIN user_professors up ON up.id = d.professor_id
           GROUP BY d.professor_id, up.firstname, up.lastname, up.employee_id`,
        );

        for (const dtr of dtrRes.rows) {
          const hours = Number(dtr.total_hours) || 80;
          const rate = 250;
          const amount = Math.round(hours * rate);
          const status: 'Approved' | 'Pending' | 'Rejected' =
            dtr.days_logged >= 20 ? 'Approved' : 'Pending';
          const period =
            dtr.min_date && dtr.max_date
              ? `${new Date(dtr.min_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(dtr.max_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : 'Sep 1–15';
          allRecords.push({
            id: `dtr-${dtr.professor_id}`,
            name: dtr.name,
            employeeId: dtr.employee_id,
            type: 'DTR',
            period,
            units: `${dtr.days_logged} days (${hours.toFixed(1)} hrs)`,
            rate,
            amount,
            status,
          });
        }
      }

      // Slice for pagination if requested
      const safeOffset = typeof offset === 'number' && !isNaN(offset) ? offset : 0;
      const safeLimit = typeof limit === 'number' && !isNaN(limit) && limit > 0 ? limit : 100;
      const paginated = allRecords.slice(safeOffset, safeOffset + safeLimit);

      const records = paginated.map((r) => ({
        id: r.id,
        name: r.name,
        employeeId: r.employeeId,
        type: r.type,
        period: r.period,
        units: r.units,
        rate: `₱${r.rate.toLocaleString()}`,
        amount: `₱${r.amount.toLocaleString()}`,
        status: r.status,
      }));

      const counts = allRecords.reduce(
        (res, r) => {
          res[r.status] = (res[r.status] || 0) + 1;
          return res;
        },
        { Approved: 0, Pending: 0, Rejected: 0 },
      );

      const sums = allRecords.reduce(
        (res, r) => {
          res[r.status] = (res[r.status] || 0) + r.amount;
          return res;
        },
        { Approved: 0, Pending: 0, Rejected: 0 },
      );

      const total = allRecords.length || 1;
      const formatMoney = (val: number) => {
        if (val >= 1_000_000) return `₱${(val / 1_000_000).toFixed(2)}M`;
        return `₱${val.toLocaleString()}`;
      };

      const classes = [
        {
          label: 'Accepted',
          note: `${counts.Approved} records`,
          value: formatMoney(sums.Approved),
          pct: Math.round((counts.Approved / total) * 100),
          color: '#4a9d62',
        },
        {
          label: 'Pending',
          note: `${counts.Pending} records`,
          value: formatMoney(sums.Pending),
          pct: Math.round((counts.Pending / total) * 100),
          color: '#e0a63a',
        },
        {
          label: 'Rejected',
          note: `${counts.Rejected} records`,
          value: formatMoney(sums.Rejected),
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
