import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerAdminDto, LoggerAuthDto } from './dto/logger.dto';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { AdminLog } from '../lib/data/logger.interface';

@Injectable()
export class LoggerService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async logAdminAction(data: LoggerAdminDto) {
    try {
      const {
        action_type,
        action_status,
        admin_email,
        admin_id,
        user_email,
        user_id,
      } = data;
      const response = await this.db.query<AdminLog>(
        `
        INSERT INTO admin_logs (
            action_type,
            action_status,
            admin_id,
            admin_email,
            user_id,
            user_email
        ) VALUES ( $1, $2, $3, $4, $5, $6)
         RETURNING *;
        `,
        [
          action_type,
          action_status,
          admin_id,
          admin_email,
          user_id,
          user_email,
        ],
      );

      if (!response)
        return ErrorHandler(
          'Error Recording Logs',
          500,
          'Database process failed, please try again later',
        );

      return SuccessHandler('Successfully recorded logs', 200, response);
    } catch (error) {
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error.name);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
  async logAuthAction(data: LoggerAuthDto) {
    try {
      const { action_type, action_status, user_email, user_id, role } = data;
      const response = await this.db.query<AdminLog>(
        `
        INSERT INTO auth_logs (
            action_type,
            action_status,
            user_id,
            user_email,
            role
        ) VALUES ( $1, $2, $3, $4, $5, $6)
         RETURNING *;
        `,
        [action_type, action_status, user_id, user_email, role],
      );

      if (!response)
        return ErrorHandler(
          'Error Recording Logs',
          500,
          'Database process failed, please try again later',
        );

      return SuccessHandler('Successfully recorded logs', 200, response);
    } catch (error) {
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error.name);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
