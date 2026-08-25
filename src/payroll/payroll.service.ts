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
      const response = await this.db.query<PayrollData>(
        `SELECT * FROM payroll
          OFFSET $1 LIMIT $2`,
        [offset ?? 0, limit ?? 20],
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
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'create_payroll',
          admin_id: user.id,
          user_id: data.user_id,
          metadata: {},
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
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'update_payroll',
          admin_id: user.id,
          user_id: id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to update payroll, please try again later',
          500,
        );
      }

      await this.loggerService.logAdminAction({
        action_status: 'success',
        action_type: 'update_payroll',
        admin_id: user.id,
        user_id: id,
        metadata: {},
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
        await this.loggerService.logAdminAction({
          action_status: 'failure',
          action_type: 'delete_payroll',
          admin_id: user.id,
          user_id: id,
          metadata: {},
        });
        return ErrorHandler(
          'Failed to delete payroll, please try again later',
          500,
        );
      }

      await this.loggerService.logAdminAction({
        action_status: 'success',
        action_type: 'delete_payroll',
        admin_id: user.id,
        user_id: id,
        metadata: {},
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
