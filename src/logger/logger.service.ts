import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerAdminDto, LoggerAuthDto, LoggerUserDto } from './dto/logger.dto';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { AdminLog, UserLog } from '../lib/data/logger.interface';

@Injectable()
export class LoggerService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  private errorResponse(error: unknown) {
    if (error instanceof Error) {
      return ErrorHandler(error.message, 500, error.name);
    }
    return ErrorHandler('Server Error', 500, 'Unknown Error');
  }

  /**
   * Admin-only actions (user management). Recorded in `admin_logs`.
   */
  async logAdminAction(data: LoggerAdminDto) {
    try {
      const {
        action_type,
        auth_action,
        action_status,
        admin_id,
        user_id,
        metadata,
      } = data;
      const response = await this.db.query<AdminLog>(
        `
        INSERT INTO admin_logs (
            action_type,
            auth_action,
            action_status,
            admin_id,
            user_id, 
            metadata
        ) VALUES ( $1, $2, $3, $4, $5, $6)
         RETURNING *;
        `,
        [
          action_type ?? null,
          auth_action ?? null,
          action_status,
          admin_id,
          user_id ?? null,
          metadata ?? {},
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
      return this.errorResponse(error);
    }
  }

  /**
   * Staff/professor actions (reports, payroll). Recorded in `user_logs`.
   */
  async logUserAction(data: LoggerUserDto) {
    try {
      const {
        action_type,
        auth_action,
        action_status,
        user_id,
        role,
        metadata,
      } = data;

      // `user_logs` has no single FK target: staff and professors live in
      // separate tables. Populate the role-scoped FK column so the row is
      // actually linked to its subject.
      const staff_id = role === 'staff' ? user_id : null;
      const professor_id = role === 'professor' ? user_id : null;

      const response = await this.db.query<UserLog>(
        `
        INSERT INTO user_logs (
            action_type,
            auth_action,
            action_status,
            user_id,
            role,
            staff_id,
            professor_id,
            metadata
        ) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *;
        `,
        [
          action_type ?? null,
          auth_action ?? null,
          action_status,
          user_id,
          role,
          staff_id,
          professor_id,
          JSON.stringify(metadata ?? {}),
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
      return this.errorResponse(error);
    }
  }

  /**
   * Authentication actions (signin/signup/signout). Routed by role:
   * admins are recorded in `admin_logs`, staff/professors in `user_logs`.
   * The auth action is stored in the `auth_action` column.
   */
  async logAuthAction(data: LoggerAuthDto) {
    const { auth_action, action_status, user_id, role, metadata } = data;

    if (role === 'admin') {
      if (!user_id) {
        return SuccessHandler('Skipped anonymous auth log', 200, null);
      }

      return this.logAdminAction({
        auth_action,
        action_status,
        admin_id: user_id,
        metadata: metadata ?? {},
      });
    }

    if (!user_id) {
      return SuccessHandler('Skipped anonymous auth log', 200, null);
    }

    return this.logUserAction({
      auth_action,
      action_status,
      user_id,
      role: role ?? 'staff',
      metadata: metadata ?? {},
    });
  }
}
